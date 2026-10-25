import { useAtomValue } from '@effect/atom-react';
import { alwaysHiddenGlobsAtom, Button, Checkbox, Dialog, DialogContent, Input } from '@lib/ui';
import { listShallowDirectories } from '@lib/ui/fd-listing';
import { hostRunPromise } from '@lib/ui/host-runtime';
import { open as openDirectoryDialog } from '@tauri-apps/plugin-dialog';
import { Fzf } from 'fzf';
import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon, CornerUpLeftIcon, FolderIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FC, KeyboardEvent } from 'react';

import {
  joinDirectory,
  normalizeDirPath,
  PARENT_DIR_ENTRY,
  parentDirectory,
  resolveHomeDir,
  toTildeBrowsePrefix,
} from '../../acp/sessionDirectoryBrowser.ts';

const showHiddenShortcutLabel = navigator.platform.toLowerCase().includes('mac') ? '⌘.' : 'Ctrl+.';

const errorMessage = (cause: unknown): string => {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  if (typeof cause === 'object' && cause !== null && 'message' in cause && typeof cause.message === 'string') {
    return cause.message;
  }
  return String(cause);
};

const Keycap: FC<{ readonly label: string }> = ({ label }) => (
  <span className="rounded-sm border border-border bg-muted px-1.5 py-px font-mono text-[0.7rem] leading-snug text-muted-foreground">
    {label}
  </span>
);

/** Directory picker only — caller owns what happens with the chosen cwd (Virtual session cwd, etc.). */
export const CreateSessionDirectoryPicker: FC<{
  readonly onClose: () => void;
  readonly onSelectDirectory: (cwd: string) => void;
}> = ({ onClose, onSelectDirectory }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const alwaysHiddenGlobs = useAtomValue(alwaysHiddenGlobsAtom);
  const [homePath, setHomePath] = useState<string | undefined>(undefined);
  const [browsePath, setBrowsePath] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<readonly string[]>([]);
  const [filter, setFilter] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [showHidden, setShowHidden] = useState(false);

  const pathPrefix =
    homePath !== undefined && browsePath !== undefined ? toTildeBrowsePrefix(browsePath, homePath) : '';
  const inputValue = `${pathPrefix}${filter}`;

  const visibleRows = useMemo(() => {
    const atHome = homePath !== undefined && browsePath !== undefined && browsePath === homePath;
    const showParent = !atHome && filter.length === 0;
    const filtered = filter.length === 0 ? [...entries] : new Fzf(entries).find(filter).map(result => result.item);
    return showParent ? [PARENT_DIR_ENTRY, ...filtered] : filtered;
  }, [browsePath, entries, filter, homePath]);

  const clampedFocus = visibleRows.length === 0 ? 0 : Math.min(focusedIndex, visibleRows.length - 1);

  useEffect(() => {
    const abort = new AbortController();

    hostRunPromise(resolveHomeDir())
      .then(async home => {
        const normalizedHome = normalizeDirPath(home);
        const dirs = await hostRunPromise(listShallowDirectories(normalizedHome, false, alwaysHiddenGlobs));
        if (abort.signal.aborted) {
          return;
        }
        setHomePath(normalizedHome);
        setBrowsePath(normalizedHome);
        setEntries(dirs);
        setFocusedIndex(0);
        setShowHidden(false);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (abort.signal.aborted) {
          return;
        }
        setError(errorMessage(cause));
        setLoading(false);
      });

    const focusTimer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => {
      abort.abort();
      window.clearTimeout(focusTimer);
    };
  }, [alwaysHiddenGlobs]);

  const loadDirectory = (nextPath: string, nextShowHidden: boolean = showHidden) => {
    setLoading(true);
    setError(undefined);
    setFilter('');
    hostRunPromise(listShallowDirectories(nextPath, nextShowHidden, alwaysHiddenGlobs))
      .then(dirs => {
        setBrowsePath(nextPath);
        setEntries(dirs);
        setFocusedIndex(0);
      })
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      })
      .finally(() => {
        setLoading(false);
        inputRef.current?.focus();
      });
  };

  const setShowHiddenAndReload = (next: boolean) => {
    setShowHidden(next);
    if (browsePath !== undefined) {
      loadDirectory(browsePath, next);
    }
  };

  const navigateParent = () => {
    if (browsePath === undefined || homePath === undefined || browsePath === homePath) {
      return;
    }
    hostRunPromise(parentDirectory(browsePath))
      .then(parent => {
        loadDirectory(parent);
      })
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      });
  };

  const selectRow = (name: string) => {
    if (browsePath === undefined) {
      return;
    }
    if (name === PARENT_DIR_ENTRY) {
      navigateParent();
      return;
    }
    hostRunPromise(joinDirectory(browsePath, name))
      .then(next => {
        loadDirectory(next);
      })
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      });
  };

  const confirmBrowsePath = () => {
    if (browsePath === undefined) {
      return;
    }
    onSelectDirectory(browsePath);
    onClose();
  };

  const openFinder = () => {
    openDirectoryDialog({ directory: true, multiple: false })
      .then(selected => {
        if (typeof selected !== 'string') {
          return;
        }
        loadDirectory(normalizeDirPath(selected));
      })
      .catch(() => undefined);
  };

  const onInputChange = (value: string) => {
    if (pathPrefix.length > 0 && value.startsWith(pathPrefix)) {
      setFilter(value.slice(pathPrefix.length));
    } else {
      setFilter(value);
    }
    setFocusedIndex(0);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === '.' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      setShowHiddenAndReload(!showHidden);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusedIndex(index => (visibleRows.length === 0 ? 0 : Math.min(index + 1, visibleRows.length - 1)));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedIndex(index => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = visibleRows.at(clampedFocus);
      if (selected !== undefined) {
        selectRow(selected);
      }
      return;
    }

    if (event.key === 'Backspace' && filter.length === 0 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      navigateParent();
    }
  };

  return (
    <Dialog
      disablePointerDismissal
      onOpenChange={open => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg" onKeyDown={onKeyDown} showCloseButton={false}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Button
            aria-label="Go to parent directory"
            disabled={browsePath === undefined || homePath === undefined || browsePath === homePath || loading}
            onClick={() => {
              navigateParent();
            }}
            size="icon-sm"
            variant="ghost"
          >
            <ArrowLeftIcon />
          </Button>
          <Input
            className="min-w-0 flex-1 border-0 font-mono text-sm shadow-none focus-visible:ring-0"
            onChange={event => {
              onInputChange(event.target.value);
            }}
            placeholder="~/…"
            ref={inputRef}
            value={inputValue}
          />
          <Button
            className="shrink-0"
            disabled={browsePath === undefined || loading}
            onClick={() => {
              confirmBrowsePath();
            }}
            size="sm"
            variant="outline"
          >
            Select
          </Button>
        </div>

        <div className="h-[360px] overflow-auto px-3 py-2">
          <p className="mb-1.5 px-1 text-xs text-muted-foreground">Directories</p>
          {error !== undefined ? <p className="px-1 text-sm text-destructive">{error}</p> : null}
          {loading && entries.length === 0 ? <p className="px-1 text-sm text-muted-foreground">Loading…</p> : null}
          {!loading && error === undefined && visibleRows.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">No directories</p>
          ) : null}
          <div className="flex flex-col gap-0.5">
            {visibleRows.map((name, index) => {
              const isParent = name === PARENT_DIR_ENTRY;
              const selected = index === clampedFocus;
              return (
                <button
                  className={
                    selected
                      ? 'flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-left text-sm'
                      : 'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted'
                  }
                  key={name}
                  onClick={() => {
                    selectRow(name);
                  }}
                  onMouseEnter={() => {
                    setFocusedIndex(index);
                  }}
                  type="button"
                >
                  {isParent ? (
                    <CornerUpLeftIcon className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate font-mono">{name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-0.5">
              <ChevronUpIcon className="size-4" />
              <ChevronDownIcon className="size-4" />
              Navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <Keycap label="Enter" />
              Open folder
            </span>
            <span className="inline-flex items-center gap-1">
              <Keycap label="Backspace" />
              Back
            </span>
            <span className="inline-flex items-center gap-1">
              <Keycap label="Esc" />
              Close
            </span>
            <span className="inline-flex items-center gap-1">
              <Keycap label={showHiddenShortcutLabel} />
              Show hidden
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-2">
              <Checkbox
                aria-labelledby="show-hidden-directories-label"
                checked={showHidden}
                disabled={loading || browsePath === undefined}
                onCheckedChange={checked => {
                  setShowHiddenAndReload(checked);
                }}
              />
              <span id="show-hidden-directories-label">Show hidden</span>
            </span>
            <Button
              onClick={() => {
                openFinder();
              }}
              size="sm"
              variant="ghost"
            >
              Open in Finder
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
