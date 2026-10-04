import { assert, describe, it } from '@effect/vitest';

import {
  DEVELOPER_PANEL_OPEN_STORAGE_KEY,
  readDeveloperPanelOpen,
  writeDeveloperPanelOpen,
} from './developerPanelOpen.atoms.ts';

const installMemoryLocalStorage = (): void => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear: () => {
        store.clear();
      },
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  });
};

describe('readDeveloperPanelOpen / writeDeveloperPanelOpen', () => {
  it('defaults to false when unset', () => {
    installMemoryLocalStorage();
    assert.isFalse(readDeveloperPanelOpen());
  });

  it('round-trips through localStorage', () => {
    installMemoryLocalStorage();
    writeDeveloperPanelOpen(true);
    assert.strictEqual(localStorage.getItem(DEVELOPER_PANEL_OPEN_STORAGE_KEY), 'true');
    assert.isTrue(readDeveloperPanelOpen());
    writeDeveloperPanelOpen(false);
    assert.isFalse(readDeveloperPanelOpen());
  });
});
