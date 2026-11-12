import type { ChatItem } from '../../../../host/sessionUpdateReducer.ts';

/** The `ChatItem` variant for a given `kind`. */
export type ChatItemOf<K extends ChatItem['kind']> = Extract<ChatItem, { kind: K }>;
