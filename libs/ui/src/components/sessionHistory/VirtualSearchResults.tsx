import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { sessionEntryKey } from '../../host/sessionEntryKey.ts';
import type { filterSessionHistoryMatches } from './filterSessionHistoryMatches.ts';

export const VirtualSearchResults = ({
  matches,
  highlightedKey,
  resetKey,
  renderRow,
}: {
  readonly matches: ReturnType<typeof filterSessionHistoryMatches>;
  readonly highlightedKey: string | undefined;
  readonly resetKey: string;
  readonly renderRow: (
    entry: UnifiedHistoryEntry,
    positions: ReadonlySet<number>,
    onInteractionChange: (key: string, active: boolean) => void,
  ) => ReactNode;
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [activeKeys, setActiveKeys] = useState<ReadonlySet<string>>(new Set());
  const onInteractionChange = (key: string, active: boolean) =>
    setActiveKeys(previous => {
      if (previous.has(key) === active) return previous;
      const next = new Set(previous);
      if (active) next.add(key);
      else next.delete(key);
      return next;
    });
  const indexByKey = useMemo(
    () => new Map(matches.map(({ entry }, index) => [sessionEntryKey(entry), index])),
    [matches],
  );
  const getItemKey = useCallback((index: number) => sessionEntryKey(matches[index]!.entry), [matches]);
  const virtualizer = useVirtualizer({
    count: matches.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    getItemKey,
    overscan: 8,
    useFlushSync: false,
    rangeExtractor: range =>
      [
        ...new Set([
          ...defaultRangeExtractor(range),
          ...[...activeKeys].flatMap(key => {
            const index = indexByKey.get(key);
            return index === undefined ? [] : [index];
          }),
        ]),
      ].sort((a, b) => a - b),
  });
  const lastResetKey = useRef<string>(undefined);
  useLayoutEffect(() => {
    if (lastResetKey.current === resetKey) return;
    lastResetKey.current = resetKey;
    const index = matches.findIndex(({ entry }) => sessionEntryKey(entry) === highlightedKey);
    if (index < 0) virtualizer.scrollToOffset(0);
    else virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [highlightedKey, matches, resetKey, virtualizer]);
  return (
    <Box ref={parentRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {matches.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2 }} variant="body2">
          No matching sessions
        </Typography>
      ) : (
        <Box sx={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map(row => {
            const match = matches[row.index]!;
            return (
              <Box
                key={row.key}
                data-index={row.index}
                data-highlighted={sessionEntryKey(match.entry) === highlightedKey}
                ref={virtualizer.measureElement}
                sx={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${row.start}px)` }}
              >
                {renderRow(match.entry, match.positions, onInteractionChange)}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
