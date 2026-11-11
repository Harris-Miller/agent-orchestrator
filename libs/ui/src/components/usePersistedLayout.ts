import { useCallback, useRef, useState } from 'react';

import { isRecord } from '../isRecord.ts';

export const isFiniteNumberArray = (value: unknown, length: number): value is number[] =>
  Array.isArray(value) &&
  value.length === length &&
  value.every(item => typeof item === 'number' && Number.isFinite(item));

/** The stored layout, or `parse({})` (the defaults) when nothing usable is stored. Never throws. */
export const loadPersistedLayout = <T>(key: string, parse: (raw: Record<string, unknown>) => T): T => {
  try {
    const stored = localStorage.getItem(key);
    const parsed: unknown = stored === null ? undefined : JSON.parse(stored);
    return parse(isRecord(parsed) ? parsed : {});
  } catch {
    return parse({});
  }
};

/**
 * A panel layout kept in `localStorage` under `key`. `parse` validates each stored field and fills defaults, so a
 * corrupt entry degrades to the defaults. `commit` merges a patch and saves it; with `rerender` false the saved value
 * changes without a re-render (sash drags). `latest` reads the freshest layout, including such silent commits.
 */
export const usePersistedLayout = <T extends object>(options: {
  readonly key: string;
  readonly parse: (raw: Record<string, unknown>) => T;
}) => {
  const { key, parse } = options;
  const [layout, setLayout] = useState(() => loadPersistedLayout(key, parse));
  const layoutRef = useRef(layout);

  const commit = useCallback(
    (patch: Partial<T>, rerender = true) => {
      const next = { ...layoutRef.current, ...patch };
      layoutRef.current = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Storage unavailable: the layout still applies for this session.
      }
      if (rerender) {
        setLayout(next);
      }
    },
    [key],
  );
  const latest = useCallback(() => layoutRef.current, []);

  return { commit, latest, layout };
};
