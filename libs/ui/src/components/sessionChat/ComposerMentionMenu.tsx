import type { FC } from 'react';

import type { FdListingEntry } from '../../host/fdListing.ts';
import { listingBasename } from '../../host/fdListing.ts';

import { ComposerMenuRow, ComposerMenuShell } from './ComposerMenuShell.tsx';

export type ComposerMentionMenuProps = {
  readonly entries: readonly FdListingEntry[];
  readonly focusedIndex: number;
  readonly loading: boolean;
  readonly onFocusIndexChange: (index: number) => void;
  readonly onSelect: (entry: FdListingEntry) => void;
  readonly open: boolean;
};

export const ComposerMentionMenu: FC<ComposerMentionMenuProps> = ({
  entries,
  focusedIndex,
  loading,
  onFocusIndexChange,
  onSelect,
  open,
}) => (
  <ComposerMenuShell focusedIndex={focusedIndex} itemCount={entries.length} loading={loading} open={open}>
    {entries.map((entry, index) => {
      const name = listingBasename(entry.path);
      return (
        <ComposerMenuRow
          index={index}
          key={`${entry.kind}:${entry.path}`}
          onFocusIndexChange={onFocusIndexChange}
          onSelect={() => {
            onSelect(entry);
          }}
          primary={entry.kind === 'dir' ? `${name}/` : name}
          secondary={entry.path}
          selected={index === focusedIndex}
        />
      );
    })}
  </ComposerMenuShell>
);
