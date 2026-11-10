/**
 * Developer panel log of `/clients` frames between this Harness and the hub. Module state like the rest of the hub
 * client; capped so a long-lived app does not grow it without bound. Tokens are shortened: enough to correlate a
 * `register` with its `toolCall`, not enough to replay.
 */
import { Predicate } from 'effect';

const MAX_ENTRIES = 500;

export type HubWireEntry = {
  readonly direction: 'received' | 'sent';
  readonly id: number;
  readonly message: unknown;
  readonly timestamp: number;
};

let entries: readonly HubWireEntry[] = [];
let nextId = 0;
const listeners = new Set<(next: readonly HubWireEntry[]) => void>();

const shortenToken = (message: unknown): unknown =>
  Predicate.isObject(message) && typeof message.token === 'string'
    ? { ...message, token: `${message.token.slice(0, 6)}…` }
    : message;

export const recordHubWire = (direction: HubWireEntry['direction'], message: unknown): void => {
  nextId += 1;
  entries = [
    ...entries.slice(-(MAX_ENTRIES - 1)),
    { direction, id: nextId, message: shortenToken(message), timestamp: Date.now() },
  ];
  for (const listener of listeners) {
    listener(entries);
  }
};

export const hubWireEntries = (): readonly HubWireEntry[] => entries;

export const onHubWireEntries = (listener: (next: readonly HubWireEntry[]) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const clearHubWire = (): void => {
  entries = [];
  for (const listener of listeners) {
    listener(entries);
  }
};
