/** Pure reducer turning ACP `session/update` payloads into ordered chat items. */

import type { SessionUsageDocument } from '@lib/ao-home';

import { isRecord } from '../isRecord.ts';

import {
  IMAGE_EXT_RE,
  isAllowedImageMimeType,
  isImageLikeResourceLink,
  mimeTypeForDataImageHref,
  mimeTypeForImagePath,
} from './composerImageAttachment.ts';
import { findMarkdownLinks } from './draftToContentBlocks.ts';

export type PlanEntry = {
  readonly content: string;
  readonly priority?: string;
  readonly status?: string;
};

export type AvailableCommand = {
  readonly description?: string;
  readonly name: string;
};

export type ConfigOption = {
  readonly currentValue?: string;
  readonly id: string;
  readonly name: string;
  readonly type?: string;
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
  | { readonly id: string; readonly kind: 'config_options'; readonly options: readonly ConfigOption[] };

export type ElicitationSummaryRow = {
  readonly caption: string | undefined;
  readonly label: string;
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

export const parseUsageUpdate = (update: unknown): SessionUsageDocument | undefined => {
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
        name: command.name,
      },
    ];
  });
};

const parseConfigOptions = (value: unknown): readonly ConfigOption[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap(option => {
    if (!isRecord(option) || typeof option.id !== 'string' || typeof option.name !== 'string') {
      return [];
    }
    return [
      {
        currentValue: typeof option.currentValue === 'string' ? option.currentValue : undefined,
        id: option.id,
        name: option.name,
        type: typeof option.type === 'string' ? option.type : undefined,
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
    case 'session_info_update':
    case 'usage_update':
      return transcript;

    case 'config_option_update': {
      const options = parseConfigOptions(update.configOptions);
      return options.length === 0
        ? transcript
        : {
            ...transcript,
            items: [...transcript.items, { id: crypto.randomUUID(), kind: 'config_options', options }],
          };
    }

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

      if (existingIndex !== undefined) {
        const existing = transcript.items[existingIndex];
        if (existing.kind === 'tool_call') {
          const items = [...transcript.items];
          items[existingIndex] = {
            ...existing,
            command: command ?? existing.command,
            locationPath: locationPath ?? existing.locationPath,
            resultText: resultText ?? existing.resultText,
            status: status ?? existing.status,
            title: title ?? existing.title,
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
          resultText,
          status: status ?? 'unknown',
          title: title ?? update.toolCallId,
          toolCallId: update.toolCallId,
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

    default:
      return transcript;
  }
};
