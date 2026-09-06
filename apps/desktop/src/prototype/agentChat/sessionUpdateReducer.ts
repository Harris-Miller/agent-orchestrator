/** Pure reducer turning ACP `session/update` payloads into ordered chat items. */

import { isRecord } from '../../utils.ts';

export type PlanEntry = {
  readonly content: string;
  readonly priority?: string;
  readonly status?: string;
};

export type AvailableCommand = {
  readonly description?: string;
  readonly name: string;
};

export type SessionUsage = {
  readonly cost?: { readonly amount: number; readonly currency: string };
  readonly size: number;
  readonly used: number;
};

export type ConfigOption = {
  readonly currentValue?: string;
  readonly id: string;
  readonly name: string;
  readonly type?: string;
};

export type ChatItem =
  | { readonly entries: readonly PlanEntry[]; readonly id: string; readonly kind: 'plan' }
  | { readonly id: string; readonly kind: 'agent_message'; readonly text: string }
  | { readonly id: string; readonly kind: 'config_options'; readonly options: readonly ConfigOption[] }
  | {
      readonly id: string;
      readonly kind: 'tool_call';
      readonly resultText?: string;
      readonly status: string;
      readonly title: string;
      readonly toolCallId: string;
      readonly toolKind?: string;
    }
  | { readonly id: string; readonly kind: 'user_message'; readonly text: string };

type ChatAccumulator = {
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

const appendMessageChunk = (
  accumulator: ChatAccumulator,
  kind: 'agent_message' | 'user_message',
  messageId: string | undefined,
  text: string,
): ChatAccumulator => {
  if (messageId !== undefined) {
    const existingIndex = accumulator.messageIndices.get(messageId);
    if (existingIndex !== undefined) {
      const existing = accumulator.items[existingIndex];
      if (existing.kind === kind) {
        const items = [...accumulator.items];
        items[existingIndex] = { ...existing, text: `${existing.text}${text}` };
        return { ...accumulator, items };
      }
    }
  }

  const id = messageId ?? crypto.randomUUID();
  const items = [...accumulator.items, { id, kind, text }];
  const messageIndices =
    messageId === undefined
      ? accumulator.messageIndices
      : new Map(accumulator.messageIndices).set(messageId, items.length - 1);

  return { ...accumulator, items, messageIndices };
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

export const emptyChatAccumulator = (): ChatAccumulator => ({
  items: [],
  messageIndices: new Map(),
  toolCallIndices: new Map(),
});

export const appendUserChatMessage = (accumulator: ChatAccumulator, text: string): ChatAccumulator =>
  appendMessageChunk(accumulator, 'user_message', undefined, text);

export const reduceSessionUpdate = (accumulator: ChatAccumulator, update: unknown): ChatAccumulator => {
  if (!isRecord(update) || typeof update.sessionUpdate !== 'string') {
    return accumulator;
  }

  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      const text = extractTextFromContent(update.content);
      return text === undefined
        ? accumulator
        : appendMessageChunk(
            accumulator,
            'agent_message',
            typeof update.messageId === 'string' ? update.messageId : undefined,
            text,
          );
    }

    case 'available_commands_update':
    case 'session_info_update':
    case 'usage_update':
      return accumulator;

    case 'config_option_update': {
      const options = parseConfigOptions(update.configOptions);
      return options.length === 0
        ? accumulator
        : {
            ...accumulator,
            items: [...accumulator.items, { id: crypto.randomUUID(), kind: 'config_options', options }],
          };
    }

    case 'plan': {
      const entries = parsePlanEntries(update.entries);
      return entries.length === 0
        ? accumulator
        : {
            ...accumulator,
            items: [...accumulator.items, { entries, id: crypto.randomUUID(), kind: 'plan' }],
          };
    }

    case 'tool_call': {
      if (typeof update.toolCallId !== 'string' || typeof update.title !== 'string') {
        return accumulator;
      }

      const status = typeof update.status === 'string' ? update.status : 'pending';
      const items = [
        ...accumulator.items,
        {
          id: update.toolCallId,
          kind: 'tool_call' as const,
          status,
          title: update.title,
          toolCallId: update.toolCallId,
          toolKind: typeof update.kind === 'string' ? update.kind : undefined,
        },
      ];
      const toolCallIndices = new Map(accumulator.toolCallIndices).set(update.toolCallId, items.length - 1);

      return { ...accumulator, items, toolCallIndices };
    }

    case 'tool_call_update': {
      if (typeof update.toolCallId !== 'string') {
        return accumulator;
      }

      const existingIndex = accumulator.toolCallIndices.get(update.toolCallId);
      const resultText = extractTextFromContent(update.content);
      const status = typeof update.status === 'string' ? update.status : undefined;

      if (existingIndex !== undefined) {
        const existing = accumulator.items[existingIndex];
        if (existing.kind === 'tool_call') {
          const items = [...accumulator.items];
          items[existingIndex] = {
            ...existing,
            resultText: resultText ?? existing.resultText,
            status: status ?? existing.status,
          };
          return { ...accumulator, items };
        }
      }

      const items = [
        ...accumulator.items,
        {
          id: update.toolCallId,
          kind: 'tool_call' as const,
          resultText,
          status: status ?? 'unknown',
          title: update.toolCallId,
          toolCallId: update.toolCallId,
        },
      ];
      const toolCallIndices = new Map(accumulator.toolCallIndices).set(update.toolCallId, items.length - 1);

      return { ...accumulator, items, toolCallIndices };
    }

    case 'user_message_chunk': {
      const text = extractTextFromContent(update.content);
      return text === undefined
        ? accumulator
        : appendMessageChunk(
            accumulator,
            'user_message',
            typeof update.messageId === 'string' ? update.messageId : undefined,
            text,
          );
    }

    default:
      return accumulator;
  }
};

export const chatItemsFromAccumulator = (accumulator: ChatAccumulator): readonly ChatItem[] => accumulator.items;
