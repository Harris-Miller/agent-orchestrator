/** Pure reducer turning ACP `session/update` payloads into ordered chat items. */

import type { SessionUsageDocument } from '@lib/ao-home';

import { isRecord } from '../isRecord.ts';

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

export type ChatItem =
  | {
      readonly command?: string;
      readonly id: string;
      readonly kind: 'tool_call';
      readonly resultText?: string;
      readonly status: string;
      readonly title: string;
      readonly toolCallId: string;
      readonly toolKind?: string;
    }
  | { readonly entries: readonly PlanEntry[]; readonly id: string; readonly kind: 'plan' }
  | { readonly id: string; readonly kind: 'agent_message'; readonly text: string }
  | { readonly id: string; readonly kind: 'config_options'; readonly options: readonly ConfigOption[] }
  | { readonly id: string; readonly kind: 'user_message'; readonly text: string };

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

const extractRawInputCommand = (rawInput: unknown): string | undefined => {
  if (!isRecord(rawInput) || typeof rawInput.command !== 'string') {
    return undefined;
  }
  return rawInput.command;
};

const extractClaudeCodeToolName = (meta: unknown): string | undefined => {
  if (!isRecord(meta)) {
    return undefined;
  }
  const { claudeCode } = meta;
  if (!isRecord(claudeCode) || claudeCode.toolName !== 'Bash') {
    return undefined;
  }
  return 'Bash';
};

const appendMessageChunk = (
  transcript: SessionTranscript,
  kind: 'agent_message' | 'user_message',
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

export const appendUserChatMessage = (transcript: SessionTranscript, text: string): SessionTranscript =>
  appendMessageChunk(transcript, 'user_message', undefined, text);

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
          resultText: extractTextFromContent(update.content),
          status,
          title: extractClaudeCodeToolName(update._meta) ?? update.title,
          toolCallId: update.toolCallId,
          toolKind: typeof update.kind === 'string' ? update.kind : undefined,
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
      const title =
        extractClaudeCodeToolName(update._meta) ?? (typeof update.title === 'string' ? update.title : undefined);

      if (existingIndex !== undefined) {
        const existing = transcript.items[existingIndex];
        if (existing.kind === 'tool_call') {
          const items = [...transcript.items];
          items[existingIndex] = {
            ...existing,
            command: command ?? existing.command,
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
      const text = extractTextFromContent(update.content);
      return text === undefined
        ? transcript
        : appendMessageChunk(
            transcript,
            'user_message',
            typeof update.messageId === 'string' ? update.messageId : undefined,
            text,
          );
    }

    default:
      return transcript;
  }
};
