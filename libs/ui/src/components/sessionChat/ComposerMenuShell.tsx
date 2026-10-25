import { cn } from 'cn';
import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { FC, ReactNode } from 'react';

import { Skeleton } from '../ui/skeleton.tsx';

export const composerMenuPanelClass = 'max-h-80 overflow-auto rounded-md border border-border bg-card shadow-lg';

export const ComposerMenuPlaceholder: FC<{ readonly loading: boolean }> = ({ loading }) =>
  loading ? (
    <div className="flex flex-col gap-1 px-3 py-2">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton className="h-7" key={index} />
      ))}
    </div>
  ) : (
    <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>
  );

const ComposerMenuRowRefContext = createContext<{
  readonly register: (index: number, node: HTMLElement | null) => void;
} | null>(null);

export type ComposerMenuShellProps = {
  readonly children: ReactNode;
  readonly focusedIndex: number;
  readonly itemCount: number;
  readonly loading?: boolean;
  readonly open: boolean;
};

export const ComposerMenuShell: FC<ComposerMenuShellProps> = ({
  children,
  focusedIndex,
  itemCount,
  loading = false,
  open,
}) => {
  const rowRefs = useRef(new Map<number, HTMLElement>());
  const registry = useMemo(
    () => ({
      register: (index: number, node: HTMLElement | null) => {
        if (node === null) {
          rowRefs.current.delete(index);
          return;
        }
        rowRefs.current.set(index, node);
      },
    }),
    [],
  );

  useLayoutEffect(() => {
    if (!open || itemCount === 0) {
      return;
    }
    rowRefs.current.get(focusedIndex)?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex, itemCount, open]);

  if (!open) {
    return null;
  }

  return (
    <div className={composerMenuPanelClass}>
      {loading || itemCount === 0 ? (
        <ComposerMenuPlaceholder loading={loading} />
      ) : (
        <ComposerMenuRowRefContext.Provider value={registry}>
          <div>{children}</div>
        </ComposerMenuRowRefContext.Provider>
      )}
    </div>
  );
};

export type ComposerMenuRowProps = {
  readonly index: number;
  readonly onFocusIndexChange: (index: number) => void;
  readonly onSelect: () => void;
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
  readonly selected: boolean;
};

export const ComposerMenuRow: FC<ComposerMenuRowProps> = ({
  index,
  onFocusIndexChange,
  onSelect,
  primary,
  secondary,
  selected,
}) => {
  const registry = useContext(ComposerMenuRowRefContext);
  const hasSecondary = secondary != null && secondary !== false && secondary !== '';

  return (
    <button
      className={cn('w-full px-2 py-1.5 text-left text-sm', selected && 'bg-accent')}
      onClick={onSelect}
      onMouseEnter={() => {
        onFocusIndexChange(index);
      }}
      ref={node => {
        registry?.register(index, node);
      }}
      type="button"
    >
      <span className="block w-full truncate">
        <span className={cn('font-mono', hasSecondary && 'mr-2')}>{primary}</span>
        {hasSecondary ? <span className="text-muted-foreground">{secondary}</span> : null}
      </span>
    </button>
  );
};
