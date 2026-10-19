import { useAtomValue } from '@effect/atom-react';
import { alwaysHiddenGlobsAtom } from '@lib/ui';
import { listShallowDirectories } from '@lib/ui/fd-listing';
import { hostRunPromise } from '@lib/ui/host-runtime';
import ArrowBack from '@mui/icons-material/ArrowBack';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import SubdirectoryArrowLeft from '@mui/icons-material/SubdirectoryArrowLeft';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { open as openDirectoryDialog } from '@tauri-apps/plugin-dialog';
import { Fzf } from 'fzf';
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
  <Box
    component="span"
    sx={{
      bgcolor: 'action.hover',
      border: 1,
      borderColor: 'divider',
      borderRadius: 0.75,
      color: 'text.secondary',
      fontFamily: 'monospace',
      fontSize: '0.7rem',
      lineHeight: 1.4,
      px: 0.75,
      py: 0.15,
    }}
  >
    {label}
  </Box>
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
        const dirs = await hostRunPromise(
          listShallowDirectories(normalizedHome, { alwaysHiddenGlobs, showHidden: false }),
        );
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
    hostRunPromise(listShallowDirectories(nextPath, { alwaysHiddenGlobs, showHidden: nextShowHidden }))
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
      fullWidth
      maxWidth="sm"
      onClose={(_event, reason) => {
        if (reason === 'backdropClick') {
          return;
        }
        onClose();
      }}
      onKeyDown={onKeyDown}
      open
      slotProps={{
        paper: {
          sx: {
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            overflow: 'hidden',
          },
        },
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', borderBottom: 1, borderColor: 'divider', gap: 1, px: 1.5, py: 1.25 }}
      >
        <IconButton
          aria-label="Go to parent directory"
          disabled={browsePath === undefined || homePath === undefined || browsePath === homePath || loading}
          edge="start"
          onClick={() => {
            navigateParent();
          }}
          size="small"
        >
          <ArrowBack fontSize="small" />
        </IconButton>
        <InputBase
          fullWidth
          inputRef={inputRef}
          onChange={event => {
            onInputChange(event.target.value);
          }}
          placeholder="~/…"
          sx={{
            flex: 1,
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            minWidth: 0,
          }}
          value={inputValue}
        />
        <Button
          disabled={browsePath === undefined || loading}
          onClick={() => {
            confirmBrowsePath();
          }}
          size="small"
          sx={{ flexShrink: 0, textTransform: 'none' }}
          variant="outlined"
        >
          Select
        </Button>
      </Stack>

      <Box sx={{ height: 360, overflow: 'auto', px: 1.5, py: 1 }}>
        <Typography color="text.secondary" sx={{ mb: 0.75, px: 0.5 }} variant="caption">
          Directories
        </Typography>
        {error !== undefined ? (
          <Typography color="error" sx={{ px: 0.5 }} variant="body2">
            {error}
          </Typography>
        ) : null}
        {loading && entries.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 0.5 }} variant="body2">
            Loading…
          </Typography>
        ) : null}
        {!loading && error === undefined && visibleRows.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 0.5 }} variant="body2">
            No directories
          </Typography>
        ) : null}
        <List dense disablePadding>
          {visibleRows.map((name, index) => {
            const isParent = name === PARENT_DIR_ENTRY;
            const selected = index === clampedFocus;
            return (
              <ListItemButton
                key={name}
                onClick={() => {
                  selectRow(name);
                }}
                onMouseEnter={() => {
                  setFocusedIndex(index);
                }}
                selected={selected}
                sx={{ borderRadius: 1, mb: 0.25 }}
              >
                <ListItemIcon sx={{ color: 'text.secondary', minWidth: 36 }}>
                  {isParent ? <SubdirectoryArrowLeft fontSize="small" /> : <FolderOutlined fontSize="small" />}
                </ListItemIcon>
                <ListItemText
                  primary={name}
                  slotProps={{
                    primary: {
                      noWrap: true,
                      sx: { fontFamily: 'monospace', fontSize: '0.875rem' },
                    },
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Box>

      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: 'center',
          borderColor: 'divider',
          borderTop: 1,
          color: 'text.secondary',
          flexWrap: 'wrap',
          gap: 1.5,
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
        }}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <KeyboardArrowUp fontSize="inherit" sx={{ fontSize: '1rem' }} />
            <KeyboardArrowDown fontSize="inherit" sx={{ fontSize: '1rem' }} />
            <Typography variant="caption">Navigate</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Keycap label="Enter" />
            <Typography variant="caption">Open folder</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Keycap label="Backspace" />
            <Typography variant="caption">Back</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Keycap label="Esc" />
            <Typography variant="caption">Close</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Keycap label={showHiddenShortcutLabel} />
            <Typography variant="caption">Show hidden</Typography>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={showHidden}
                disabled={loading || browsePath === undefined}
                onChange={(_event, checked) => {
                  setShowHiddenAndReload(checked);
                }}
                size="small"
              />
            }
            label={<Typography variant="caption">Show hidden</Typography>}
            sx={{ m: 0 }}
          />
          <Button
            onClick={() => {
              openFinder();
            }}
            size="small"
            sx={{ textTransform: 'none' }}
          >
            Open in Finder
          </Button>
        </Stack>
      </Stack>
    </Dialog>
  );
};
