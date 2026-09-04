/** Persist session usage in localStorage so load/resume can restore what agents omit. */

import { isRecord } from '../../utils.ts';

import type { SessionUsage } from './sessionUpdateReducer.ts';

const USAGE_KEY_PREFIX = 'acp-session-usage:';

const usageKey = (sessionId: string): string => `${USAGE_KEY_PREFIX}${sessionId}`;

const parseStoredUsage = (value: unknown): SessionUsage | undefined => {
  if (!isRecord(value) || typeof value.used !== 'number' || typeof value.size !== 'number') {
    return undefined;
  }

  const cost =
    isRecord(value.cost) && typeof value.cost.amount === 'number' && typeof value.cost.currency === 'string'
      ? { amount: value.cost.amount, currency: value.cost.currency }
      : undefined;

  return {
    cost,
    size: value.size,
    used: value.used,
  };
};

export const persistSessionUsage = (sessionId: string, usage: SessionUsage): void => {
  localStorage.setItem(usageKey(sessionId), JSON.stringify(usage));
};

export const readPersistedSessionUsage = (sessionId: string): SessionUsage | undefined => {
  try {
    const raw = localStorage.getItem(usageKey(sessionId));
    if (raw == null) {
      return undefined;
    }
    return parseStoredUsage(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
};
