/** Pure reducer turning ACP `session/update` payloads into ordered chat items. */

import type { SessionUsage } from './sessionUsage.ts';

import { isRecord } from '../isRecord.ts';
import { optString, withoutUndefined } from '../optionalFields.ts';

import {
  IMAGE_EXT_RE,
  isAllowedImageMimeType,
  isImageLikeResourceLink,
  mimeTypeForDataImageHref,
  mimeTypeForImagePath,
} from './composerImageAttachment.ts';
import { isSkillCommand } from './airMeta.ts';
import { findMarkdownLinks } from './draftToContentBlocks.ts';
import { WINDOWS_DRIVE } from './openChatLink.ts';

export type PlanEntry = {
  readonly content: string;
  readonly priority?: string;
  readonly status?: string;
};

export type AvailableCommand = {
  readonly description?: string;
  readonly isSkill: boolean;
  readonly name: string;
};

/** Slim image ref on a local/optimistic user_message (not full Prompt base64). */
export type UserMessageImageRef = {
  readonly mimeType: string;
  readonly name?: string;
  readonly previewDataUrl?: string;
  readonly uri?: string;
};

/** ACP `ToolKind`. */
const TOOL_KINDS = [
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'think',
  'fetch',
  'switch_mode',
  'other',
] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];
const isToolKind = (value: unknown): value is ToolKind => TOOL_KINDS.includes(value as ToolKind);

/** Client-measured turn timing (epoch ms) on a locally submitted user_message. */
export type TurnTiming = { readonly endedAt?: number; readonly startedAt?: number };

export type ChatItem =
  | {
      readonly command?: string;
      readonly id: string;
      readonly kind: 'tool_call';
      readonly locationPath?: string;
      /** Absolute path of the plan file named by a Claude `ExitPlanMode` call (`rawInput.planFilePath`). */
      readonly planFilePath?: string;
      readonly resultText?: string;
      readonly status: string;
      readonly title: string;
      readonly toolCallId: string;
      readonly toolKind?: ToolKind;
    }
  | { readonly entries: readonly PlanEntry[]; readonly id: string; readonly kind: 'plan' }
  | (TurnTiming & {
      readonly id: string;
      readonly images?: readonly UserMessageImageRef[];
      readonly kind: 'user_message';
      /** Sent via `_session/steering` into an in-flight turn (no turn timing of its own). */
      readonly steering?: true;
      readonly text: string;
    })
  | { readonly id: string; readonly kind: 'agent_message'; readonly text: string }
  | { readonly id: string; readonly kind: 'agent_thought'; readonly text: string }
  | (ElicitationSummary & { readonly id: string; readonly kind: 'elicitation_summary' })
  /** Row for a spawned child; live fields come from `BackendHarnessSnapshot.subagents[subagentSessionId]`. */
  | { readonly id: string; readonly kind: 'subagent'; readonly subagentSessionId: string }
  | InterSessionMessage
  | RequestErrorItem;

/** The Agent's error response to a Client→Agent request for this Session (`method` is the request it answered). */
export type RequestErrorItem = {
  readonly code: number;
  readonly details?: string;
  readonly id: string;
  readonly kind: 'request_error';
  readonly message: string;
  readonly method: string;
};

/** Directed message between sessions (ACP `session_message`); never a user prompt or tool call. */
export type InterSessionMessage = {
  readonly id: string;
  readonly kind: 'inter_session_message';
  readonly messageId: string;
  readonly recipientMessageId?: string;
  readonly recipientSessionId?: string;
  readonly senderMessageId?: string;
  readonly senderSessionId?: string;
  readonly text: string;
};

export type ElicitationSummaryRow = {
  readonly caption: string | undefined;
  readonly label: string;
  readonly note: string | undefined;
  readonly value: string;
};

export type ElicitationSummary = {
  readonly message: string;
  readonly rows: readonly ElicitationSummaryRow[];
};

export type SessionTranscript = {
  readonly items: readonly ChatItem[];
  readonly messageIndices: ReadonlyMap<string, number>;
  readonly toolCallIndices: ReadonlyMap<string, number>;
};

const isTextBlock = (block: unknown): block is { readonly text: string; readonly type: 'text' } => {
  if (!isRecord(block)) {
    return false;
  }
  return block.type === 'text' && typeof block.text === 'string';
};

const extractTextFromContent = (content: unknown): string | undefined => {
  if (isTextBlock(content)) {
    return content.text;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const parts = content
    .map(block => {
      if (isTextBlock(block)) {
        return block.text;
      }
      if (isRecord(block) && block.type === 'content' && isTextBlock(block.content)) {
        return block.content.text;
      }
      return undefined;
    })
    .filter((text): text is string => text !== undefined);

  return parts.length > 0 ? parts.join('\n') : undefined;
};

const resourceLinkToImageRef = (block: unknown): undefined | UserMessageImageRef => {
  if (!isImageLikeResourceLink(block) || !isRecord(block)) {
    return undefined;
  }
  const uri = typeof block.uri === 'string' ? block.uri : undefined;
  const name = typeof block.name === 'string' ? block.name : undefined;
  const mimeFromField = typeof block.mimeType === 'string' ? block.mimeType : undefined;
  const mimeType =
    mimeFromField ??
    (name !== undefined ? mimeTypeForImagePath(name) : undefined) ??
    (uri !== undefined ? mimeTypeForImagePath(uri) : undefined) ??
    'image/png';
  return { mimeType, name, uri };
};

/** ACP `type: "image"` ContentBlock → transcript ref with inline preview. */
const imageContentToImageRef = (block: unknown): undefined | UserMessageImageRef => {
  if (!isRecord(block) || block.type !== 'image') {
    return undefined;
  }
  if (typeof block.data !== 'string' || typeof block.mimeType !== 'string') {
    return undefined;
  }
  if (!isAllowedImageMimeType(block.mimeType)) {
    return undefined;
  }
  const uri = typeof block.uri === 'string' ? block.uri : undefined;
  const basename = uri?.split(/[/\\]/).pop()?.split('?')[0];
  const name = basename !== undefined && basename.length > 0 ? basename : undefined;
  const previewDataUrl = `data:${block.mimeType};base64,${block.data}`;
  return {
    mimeType: block.mimeType,
    previewDataUrl,
    ...(name !== undefined ? { name } : {}),
    ...(uri !== undefined ? { uri } : {}),
  };
};

const contentBlockToImageRef = (block: unknown): undefined | UserMessageImageRef =>
  imageContentToImageRef(block) ?? resourceLinkToImageRef(block);

export const extractImageRefsFromContent = (content: unknown): readonly UserMessageImageRef[] => {
  const single = contentBlockToImageRef(content);
  if (single !== undefined) {
    return [single];
  }

  if (!Array.isArray(content)) {
    return [];
  }

  return content.flatMap(block => {
    const ref = contentBlockToImageRef(block);
    return ref === undefined ? [] : [ref];
  });
};

/**
 * Agents often rewrite image attaches as markdown on `session/load`:
 * `[@name](file://…ext)` or `[@name](data:image/…;base64,…)`.
 * Lift those into image refs and strip them from transcript text.
 */
const liftImageMarkdownLinks = (
  text: string,
): { readonly images: readonly UserMessageImageRef[]; readonly text: string } => {
  const links = findMarkdownLinks(text);
  if (links.length === 0) {
    return { images: [], text };
  }

  const imageLinks = links.filter(
    link =>
      (link.href.startsWith('file://') && IMAGE_EXT_RE.test(link.href)) ||
      mimeTypeForDataImageHref(link.href) !== undefined,
  );
  if (imageLinks.length === 0) {
    return { images: [], text };
  }

  let nextText = text;
  for (const link of [...imageLinks].reverse()) {
    nextText = `${nextText.slice(0, link.start)}${nextText.slice(link.end)}`;
  }

  const images = imageLinks.map(link => {
    const dataMime = mimeTypeForDataImageHref(link.href);
    const mimeType = dataMime ?? mimeTypeForImagePath(link.href) ?? 'image/png';
    const label = link.label.startsWith('@') ? link.label.slice(1) : link.label;
    const name = label.length > 0 ? label : undefined;
    if (dataMime !== undefined) {
      return { mimeType, name, previewDataUrl: link.href, uri: link.href };
    }
    return { mimeType, name, uri: link.href };
  });

  return {
    images,
    text: nextText
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  };
};

const appendUserMessageChunk = (
  transcript: SessionTranscript,
  messageId: string | undefined,
  text: string | undefined,
  images: readonly UserMessageImageRef[],
): SessionTranscript => {
  const hasText = text !== undefined && text.length > 0;
  const hasImages = images.length > 0;
  if (!hasText && !hasImages) {
    return transcript;
  }

  if (messageId !== undefined) {
    const existingIndex = transcript.messageIndices.get(messageId);
    if (existingIndex !== undefined) {
      const existing = transcript.items[existingIndex];
      if (existing.kind === 'user_message') {
        const items = [...transcript.items];
        items[existingIndex] = {
          ...existing,
          images: hasImages ? [...(existing.images ?? []), ...images] : existing.images,
          text: hasText ? `${existing.text}${text}` : existing.text,
        };
        return { ...transcript, items };
      }
    }
  }

  // Image-only follow-up without messageId (session/load): merge onto trailing user_message.
  if (!hasText && hasImages) {
    const last = transcript.items.at(-1);
    if (last?.kind === 'user_message') {
      const items = [...transcript.items];
      items[items.length - 1] = {
        ...last,
        images: [...(last.images ?? []), ...images],
      };
      return { ...transcript, items };
    }
  }

  const id = messageId ?? crypto.randomUUID();
  const items = [
    ...transcript.items,
    {
      id,
      kind: 'user_message' as const,
      text: text ?? '',
      ...(hasImages ? { images } : {}),
    },
  ];
  const messageIndices =
    messageId === undefined
      ? transcript.messageIndices
      : new Map(transcript.messageIndices).set(messageId, items.length - 1);

  return { ...transcript, items, messageIndices };
};

const extractRawInputCommand = (rawInput: unknown): string | undefined => {
  if (!isRecord(rawInput) || typeof rawInput.command !== 'string') {
    return undefined;
  }
  return rawInput.command;
};

/** Only a non-empty absolute string counts; anything else is ignored so it never clears a stored path. */
const extractPlanFilePath = (rawInput: unknown): string | undefined => {
  if (!isRecord(rawInput) || typeof rawInput.planFilePath !== 'string') {
    return undefined;
  }
  const path = rawInput.planFilePath;
  return path.startsWith('/') || WINDOWS_DRIVE.test(path) ? path : undefined;
};

/** Spreads `{ planFilePath }`, or nothing when absent (exactOptionalPropertyTypes forbids an explicit `undefined`). */
const withPlanFilePath = (planFilePath: string | undefined) => (planFilePath === undefined ? {} : { planFilePath });

/** Path of the first location only; tool_call titles link a single file. */
const extractLocationPath = (locations: unknown): string | undefined => {
  if (!Array.isArray(locations)) {
    return undefined;
  }
  const [first] = locations as unknown[];
  if (typeof first === 'string') {
    return first;
  }
  return isRecord(first) && typeof first.path === 'string' ? first.path : undefined;
};

const appendMessageChunk = (
  transcript: SessionTranscript,
  kind: 'agent_message' | 'agent_thought' | 'user_message',
  messageId: string | undefined,
  text: string,
): SessionTranscript => {
  if (messageId !== undefined) {
    const existingIndex = transcript.messageIndices.get(messageId);
    if (existingIndex !== undefined) {
      const existing = transcript.items[existingIndex];
      if (existing.kind === kind) {
        const items = [...transcript.items];
        items[existingIndex] = { ...existing, text: `${existing.text}${text}` };
        return { ...transcript, items };
      }
    }
  }

  // v1 messageId is optional: consecutive agent/thought stream chunks append to the trailing item.
  if (kind !== 'user_message') {
    const last = transcript.items.at(-1);
    if (last?.kind === kind) {
      const items = [...transcript.items];
      items[items.length - 1] = { ...last, text: `${last.text}${text}` };
      return { ...transcript, items };
    }
  }

  const id = messageId ?? crypto.randomUUID();
  const items = [...transcript.items, { id, kind, text }];
  const messageIndices =
    messageId === undefined
      ? transcript.messageIndices
      : new Map(transcript.messageIndices).set(messageId, items.length - 1);

  return { ...transcript, items, messageIndices };
};

/** Cross-transcript refs: a conflicting repeat means the link is ambiguous, so it is dropped. */
const mergeRef = (existing: string | undefined, incoming: string | undefined): string | undefined =>
  existing === undefined ? incoming : incoming === undefined || incoming === existing ? existing : undefined;

const refFields = (update: Readonly<Record<string, unknown>>) => ({
  recipientMessageId: optString(update.recipientMessageId),
  recipientSessionId: optString(update.recipientSessionId ?? update.recipient),
  senderMessageId: optString(update.senderMessageId),
  senderSessionId: optString(update.senderSessionId ?? update.sender),
});

/** Upsert by `messageId` within this transcript; `append` adds a chunk's text instead of replacing it. */
const upsertInterSessionMessage = (
  transcript: SessionTranscript,
  update: Readonly<Record<string, unknown>>,
  append: boolean,
): SessionTranscript => {
  const messageId = optString(update.messageId);
  if (messageId === undefined) {
    return transcript;
  }
  const text = extractTextFromContent(update.content) ?? '';
  const refs = refFields(update);
  const index = transcript.messageIndices.get(messageId);
  const existing = index === undefined ? undefined : transcript.items[index];
  if (index !== undefined && existing?.kind === 'inter_session_message') {
    const items = [...transcript.items];
    items[index] = withoutUndefined({
      ...existing,
      recipientMessageId: mergeRef(existing.recipientMessageId, refs.recipientMessageId),
      recipientSessionId: refs.recipientSessionId ?? existing.recipientSessionId,
      senderMessageId: mergeRef(existing.senderMessageId, refs.senderMessageId),
      senderSessionId: refs.senderSessionId ?? existing.senderSessionId,
      text: append ? `${existing.text}${text}` : text.length > 0 ? text : existing.text,
    });
    return { ...transcript, items };
  }
  const items = [
    ...transcript.items,
    withoutUndefined({
      id: messageId,
      kind: 'inter_session_message' as const,
      messageId,
      ...refs,
      text,
    }),
  ];
  return { ...transcript, items, messageIndices: new Map(transcript.messageIndices).set(messageId, items.length - 1) };
};

/** Insert the `subagent` row once per child id (replayed spawns never duplicate). */
export const upsertSubagentChatItem = (transcript: SessionTranscript, subagentSessionId: string): SessionTranscript => {
  const id = `subagent:${subagentSessionId}`;
  return transcript.items.some(item => item.kind === 'subagent' && item.subagentSessionId === subagentSessionId)
    ? transcript
    : { ...transcript, items: [...transcript.items, { id, kind: 'subagent', subagentSessionId }] };
};

const parsePlanEntries = (value: unknown): readonly PlanEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(entry => {
    if (!isRecord(entry) || typeof entry.content !== 'string') {
      return [];
    }
    return [
      {
        content: entry.content,
        priority: typeof entry.priority === 'string' ? entry.priority : undefined,
        status: typeof entry.status === 'string' ? entry.status : undefined,
      },
    ];
  });
};

export const parseUsageUpdate = (update: unknown): SessionUsage | undefined => {
  if (!isRecord(update) || update.sessionUpdate !== 'usage_update') {
    return undefined;
  }

  if (typeof update.used !== 'number' || typeof update.size !== 'number') {
    return undefined;
  }

  const cost =
    isRecord(update.cost) && typeof update.cost.amount === 'number' && typeof update.cost.currency === 'string'
      ? { amount: update.cost.amount, currency: update.cost.currency }
      : undefined;

  return {
    cost,
    size: update.size,
    used: update.used,
  };
};

export const parseAvailableCommands = (value: unknown): readonly AvailableCommand[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(command => {
    if (!isRecord(command) || typeof command.name !== 'string') {
      return [];
    }
    return [
      {
        description: typeof command.description === 'string' ? command.description : undefined,
        isSkill: isSkillCommand(command),
        name: command.name,
      },
    ];
  });
};

export const emptySessionTranscript = (): SessionTranscript => ({
  items: [],
  messageIndices: new Map(),
  toolCallIndices: new Map(),
});

const FINISHED_TOOL_STATUSES = new Set(['cancelled', 'completed', 'failed']);

/** Preemptive Prompt turn cancel: mark non-finished tool calls cancelled. */
export const markNonFinishedToolCallsCancelled = (transcript: SessionTranscript): SessionTranscript => ({
  ...transcript,
  items: transcript.items.map(item => {
    if (item.kind !== 'tool_call' || FINISHED_TOOL_STATUSES.has(item.status)) {
      return item;
    }
    return { ...item, status: 'cancelled' };
  }),
});

/** Patch timing stamps onto one user_message; other items and missing ids unchanged. */
export const stampUserMessageTiming = (
  transcript: SessionTranscript,
  id: string,
  patch: TurnTiming,
): SessionTranscript => ({
  ...transcript,
  items: transcript.items.map(item => (item.id === id && item.kind === 'user_message' ? { ...item, ...patch } : item)),
});

export const appendUserChatMessage = (
  transcript: SessionTranscript,
  text: string,
  images?: readonly UserMessageImageRef[],
  options?: { readonly steering?: true },
): SessionTranscript => {
  // Same lift as session/load `user_message_chunk`: `@` image markdown → top thumbnails.
  const lifted = liftImageMarkdownLinks(text);
  const mergedImages = [...(images ?? []), ...lifted.images];
  const steering = options?.steering;
  if (mergedImages.length === 0 && steering === undefined) {
    return appendMessageChunk(transcript, 'user_message', undefined, lifted.text);
  }
  const id = crypto.randomUUID();
  return {
    ...transcript,
    items: [
      ...transcript.items,
      {
        id,
        kind: 'user_message',
        text: lifted.text,
        ...(mergedImages.length > 0 ? { images: mergedImages } : {}),
        ...(steering === undefined ? {} : { steering }),
      },
    ],
  };
};

export const appendRequestErrorItem = (
  transcript: SessionTranscript,
  item: Omit<RequestErrorItem, 'id' | 'kind'>,
): SessionTranscript => ({
  ...transcript,
  items: [...transcript.items, { ...item, id: crypto.randomUUID(), kind: 'request_error' }],
});

/** Empty summaries (nothing answered) leave the transcript unchanged. */
export const appendElicitationSummary = (
  transcript: SessionTranscript,
  summary: ElicitationSummary,
): SessionTranscript =>
  summary.rows.length === 0
    ? transcript
    : {
        ...transcript,
        items: [...transcript.items, { ...summary, id: crypto.randomUUID(), kind: 'elicitation_summary' }],
      };

export const reduceSessionUpdate = (transcript: SessionTranscript, update: unknown): SessionTranscript => {
  if (!isRecord(update) || typeof update.sessionUpdate !== 'string') {
    return transcript;
  }

  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      const text = extractTextFromContent(update.content);
      return text === undefined
        ? transcript
        : appendMessageChunk(
            transcript,
            'agent_message',
            typeof update.messageId === 'string' ? update.messageId : undefined,
            text,
          );
    }

    case 'agent_thought_chunk': {
      const text = extractTextFromContent(update.content);
      return text === undefined
        ? transcript
        : appendMessageChunk(
            transcript,
            'agent_thought',
            typeof update.messageId === 'string' ? update.messageId : undefined,
            text,
          );
    }

    case 'available_commands_update':
    case 'config_option_update':
    case 'session_info_update':
    case 'usage_update':
      return transcript;

    case 'plan': {
      const entries = parsePlanEntries(update.entries);
      return entries.length === 0
        ? transcript
        : {
            ...transcript,
            items: [...transcript.items, { entries, id: crypto.randomUUID(), kind: 'plan' }],
          };
    }

    case 'tool_call': {
      if (typeof update.toolCallId !== 'string' || typeof update.title !== 'string') {
        return transcript;
      }

      const status = typeof update.status === 'string' ? update.status : 'pending';
      const items = [
        ...transcript.items,
        {
          command: extractRawInputCommand(update.rawInput),
          id: update.toolCallId,
          kind: 'tool_call' as const,
          locationPath: extractLocationPath(update.locations),
          ...withPlanFilePath(extractPlanFilePath(update.rawInput)),
          resultText: extractTextFromContent(update.content),
          status,
          title: update.title,
          toolCallId: update.toolCallId,
          toolKind: isToolKind(update.kind) ? update.kind : undefined,
        },
      ];
      const toolCallIndices = new Map(transcript.toolCallIndices).set(update.toolCallId, items.length - 1);

      return { ...transcript, items, toolCallIndices };
    }

    case 'tool_call_update': {
      if (typeof update.toolCallId !== 'string') {
        return transcript;
      }

      const existingIndex = transcript.toolCallIndices.get(update.toolCallId);
      const command = extractRawInputCommand(update.rawInput);
      const resultText = extractTextFromContent(update.content);
      const status = typeof update.status === 'string' ? update.status : undefined;
      const title = typeof update.title === 'string' ? update.title : undefined;
      const locationPath = extractLocationPath(update.locations);
      const planFilePath = extractPlanFilePath(update.rawInput);
      const toolKind = isToolKind(update.kind) ? update.kind : undefined;

      if (existingIndex !== undefined) {
        const existing = transcript.items[existingIndex];
        if (existing.kind === 'tool_call') {
          const items = [...transcript.items];
          items[existingIndex] = {
            ...existing,
            command: command ?? existing.command,
            locationPath: locationPath ?? existing.locationPath,
            ...withPlanFilePath(planFilePath ?? existing.planFilePath),
            resultText: resultText ?? existing.resultText,
            status: status ?? existing.status,
            title: title ?? existing.title,
            toolKind: toolKind ?? existing.toolKind,
          };
          return { ...transcript, items };
        }
      }

      const items = [
        ...transcript.items,
        {
          command,
          id: update.toolCallId,
          kind: 'tool_call' as const,
          locationPath,
          ...withPlanFilePath(planFilePath),
          resultText,
          status: status ?? 'unknown',
          title: title ?? update.toolCallId,
          toolCallId: update.toolCallId,
          toolKind,
        },
      ];
      const toolCallIndices = new Map(transcript.toolCallIndices).set(update.toolCallId, items.length - 1);

      return { ...transcript, items, toolCallIndices };
    }

    case 'user_message_chunk': {
      const rawText = extractTextFromContent(update.content);
      const blockImages = extractImageRefsFromContent(update.content);
      const lifted = rawText === undefined ? { images: [] as const, text: undefined } : liftImageMarkdownLinks(rawText);
      return appendUserMessageChunk(
        transcript,
        typeof update.messageId === 'string' ? update.messageId : undefined,
        lifted.text,
        [...blockImages, ...lifted.images],
      );
    }

    case 'session_message':
      return upsertInterSessionMessage(transcript, update, false);

    case 'session_message_chunk':
      return upsertInterSessionMessage(transcript, update, true);

    default:
      return transcript;
  }
};

/**
 * The last non-blank agent message after the last user message: a Spawned subagent session's final message (its task is
 * the last user message; it never receives Steering). Undefined when the turn produced none.
 */
export const lastAgentMessage = (transcript: SessionTranscript): string | undefined => {
  for (let i = transcript.items.length - 1; i >= 0; i -= 1) {
    const item = transcript.items[i];
    if (item.kind === 'user_message') return undefined;
    if (item.kind === 'agent_message' && item.text.trim().length > 0) return item.text;
  }
  return undefined;
};

const MAX_ACTIVITY_LENGTH = 80;

/** Last tool title, else last agent message collapsed to one truncated line. */
export const latestTranscriptActivity = (transcript: SessionTranscript): string | undefined => {
  for (let i = transcript.items.length - 1; i >= 0; i -= 1) {
    const item = transcript.items[i];
    if (item.kind === 'tool_call') return item.title;
    if (item.kind === 'agent_message' && item.text.trim().length > 0) {
      const line = item.text.trim().replace(/\s+/g, ' ');
      return line.length > MAX_ACTIVITY_LENGTH ? `${line.slice(0, MAX_ACTIVITY_LENGTH - 1)}…` : line;
    }
  }
  return undefined;
};
