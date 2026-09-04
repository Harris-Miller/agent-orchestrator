import { assert, describe, it } from '@effect/vitest';
import { beforeEach } from 'vitest';

import { persistSessionUsage, readPersistedSessionUsage } from './sessionUsageStorage.ts';

const memoryStore = new Map<string, string>();

const memoryLocalStorage = {
  clear: () => {
    memoryStore.clear();
  },
  getItem: (key: string) => memoryStore.get(key) ?? null,
  removeItem: (key: string) => {
    memoryStore.delete(key);
  },
  setItem: (key: string, value: string) => {
    memoryStore.set(key, value);
  },
};

Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryLocalStorage });

beforeEach(() => {
  memoryStore.clear();
});

describe('sessionUsageStorage', () => {
  it('returns undefined when no key exists', () => {
    assert.strictEqual(readPersistedSessionUsage('missing'), undefined);
  });

  it('round-trips usage for a sessionId', () => {
    const usage = { cost: { amount: 0.045, currency: 'USD' }, size: 200_000, used: 53_000 };
    persistSessionUsage('sess-1', usage);
    assert.deepStrictEqual(readPersistedSessionUsage('sess-1'), usage);
  });

  it('returns undefined for corrupt JSON', () => {
    localStorage.setItem('acp-session-usage:sess-bad', '{not-json');
    assert.strictEqual(readPersistedSessionUsage('sess-bad'), undefined);
  });

  it('returns undefined for invalid shape', () => {
    localStorage.setItem('acp-session-usage:sess-bad', JSON.stringify({ used: 'nope' }));
    assert.strictEqual(readPersistedSessionUsage('sess-bad'), undefined);
  });
});
