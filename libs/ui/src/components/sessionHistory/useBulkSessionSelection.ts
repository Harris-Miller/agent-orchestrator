import { useAtomValue } from '@effect/atom-react';
import { useState } from 'react';

import { enabledLaunchTargetPhasesAtom } from '../../atoms/backendState.atoms.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { sessionEntryKey } from '../../host/sessionEntryKey.ts';

import { pruneSelection, selectAllKeys, toggleKey } from './bulkSelection.ts';
import { isSessionHistoryEntryAvailable } from './isSessionHistoryEntryAvailable.ts';

export type BulkSessionSelection = ReturnType<typeof useBulkSessionSelection>;

/**
 * Bulk select state for Session History. `visibleEntries` are the rows the host currently lists; unavailable ones
 * (entry marked unavailable, provider not usable) cannot be selected. `suspended` (search active) exits the mode. Leaving the mode clears the selection.
 */
export const useBulkSessionSelection = (visibleEntries: readonly UnifiedHistoryEntry[], suspended = false) => {
  const phases = useAtomValue(enabledLaunchTargetPhasesAtom);
  const [active, setActive] = useState(false);
  const [keys, setKeys] = useState<ReadonlySet<string>>(new Set());

  if (suspended && active) {
    setActive(false);
    setKeys(new Set());
  }

  const selectable = visibleEntries.filter(entry =>
    isSessionHistoryEntryAvailable(entry, phases.find(item => item.launchTarget === entry.launchTarget)?.phase),
  );
  const selectedKeys = pruneSelection(keys, selectable);
  const selectedEntries = selectable.filter(entry => selectedKeys.has(sessionEntryKey(entry)));

  return {
    active,
    clear: () => {
      setKeys(new Set());
    },
    isSelected: (entry: UnifiedHistoryEntry) => selectedKeys.has(sessionEntryKey(entry)),
    selectAll: () => {
      setKeys(selectAllKeys(selectable));
    },
    selectedEntries,
    toggle: (entry: UnifiedHistoryEntry) => {
      setKeys(toggleKey(selectedKeys, sessionEntryKey(entry)));
    },
    toggleMode: () => {
      setActive(!active);
      setKeys(new Set());
    },
  };
};
