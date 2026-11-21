import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Archive, ArrowLeft, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FC } from 'react';

import { showArchivedAtom } from '../../atoms/backendState.atoms.ts';
import {
  closeImportAtomFn,
  importLoadMoreAtomFn,
  importRetryTargetAtomFn,
  importSessionAtomFn,
  openImportAtomFn,
} from '../../atoms/boundHarnessAtoms.ts';
import { importRowsAtom, importStateAtom } from '../../atoms/importSessions.atoms.ts';
import type { UnifiedHistoryEntry } from '../../host/acpSessionBootstrap.ts';
import { agentLaunchTargetLabel, MOUNTED_AGENT_LAUNCH_TARGETS } from '../../host/agentLaunchTarget.ts';
import { importRowTime } from '../../host/importRowTime.ts';
import { sessionEntryKey } from '../../host/sessionEntryKey.ts';
import { AgentLaunchTargetIcon } from '../AgentLaunchTargetIcon.tsx';
import { HighlightFzfChars } from '../HighlightFzfChars.tsx';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { filterSessionHistoryMatches } from './filterSessionHistoryMatches.ts';
import { DEFAULT_SESSION_TITLE } from './sessionRowMeta.ts';

type Match = { readonly entry: UnifiedHistoryEntry; readonly positions: ReadonlySet<number> | undefined };

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Could not import this session';

/**
 * Import: the in-panel mode of Session History that lists `session/list` rows of `cwd` from every usable launch target
 * (one merged list, newest Last prompt time first) and turns a confirmed row into a Tracked session.
 */
export const ImportSessionsPanel: FC<{
  readonly cwd: string;
  readonly onClientError: (error: unknown) => void;
  /** Back arrow, or a confirmed Import: return to Session History. */
  readonly onDone: () => void;
}> = ({ cwd, onClientError, onDone }) => {
  const openImport = useAtomSet(openImportAtomFn, { mode: 'promise' });
  const closeImport = useAtomSet(closeImportAtomFn, { mode: 'promise' });
  const loadMore = useAtomSet(importLoadMoreAtomFn, { mode: 'promise' });
  const retry = useAtomSet(importRetryTargetAtomFn, { mode: 'promise' });
  const importSession = useAtomSet(importSessionAtomFn, { mode: 'promise' });
  const state = useAtomValue(importStateAtom);
  const rows = useAtomValue(importRowsAtom);
  const showArchived = useAtomValue(showArchivedAtom);
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [rowError, setRowError] = useState<{ readonly key: string; readonly message: string } | undefined>();
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openImport(cwd).catch(onClientError);
    return () => {
      closeImport(undefined).catch(onClientError);
    };
  }, [closeImport, cwd, onClientError, openImport]);

  const trimmed = query.trim();
  const matches: readonly Match[] = useMemo(() => {
    if (trimmed === '') {
      return rows
        .filter(entry => showArchived || entry.archived !== true)
        .map(entry => ({ entry, positions: undefined }));
    }
    // A typed query includes archived rows whatever Show archived says.
    return filterSessionHistoryMatches(rows, trimmed);
  }, [rows, showArchived, trimmed]);

  const loading = MOUNTED_AGENT_LAUNCH_TARGETS.some(launchTarget => state.targets[launchTarget].status === 'loading');
  const hasMore = MOUNTED_AGENT_LAUNCH_TARGETS.some(launchTarget => state.targets[launchTarget].status === 'idle');
  const failed = MOUNTED_AGENT_LAUNCH_TARGETS.filter(launchTarget => state.targets[launchTarget].status === 'error');

  // The end of the list scrolls into view: fetch the next page of every target that still has one.
  useEffect(() => {
    const node = sentinel.current;
    if (node === null || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) loadMore(undefined).catch(onClientError);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [loadMore, onClientError, hasMore, loading, matches.length]);

  // While a query is active the list pages in the background until every cursor is exhausted (no server-side search).
  useEffect(() => {
    if (trimmed !== '' && hasMore && !loading) loadMore(undefined).catch(onClientError);
  }, [hasMore, loadMore, loading, onClientError, trimmed]);

  const confirm = (entry: UnifiedHistoryEntry) => {
    const key = sessionEntryKey(entry);
    setConfirming(true);
    setRowError(undefined);
    importSession({ launchTarget: entry.launchTarget, sessionId: entry.sessionId })
      .then(() => {
        onDone();
      })
      .catch((error: unknown) => {
        setConfirming(false);
        setRowError({ key, message: errorMessage(error) });
      });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack direction="row" sx={{ alignItems: 'center', flexShrink: 0, gap: 0.5, px: 1, py: 0.5 }}>
        <IconButton aria-label="Back" onClick={onDone} size="small">
          <LucideMuiIcon fontSize="small" icon={ArrowLeft} />
        </IconButton>
        <TextField
          fullWidth
          onChange={event => {
            setQuery(event.target.value);
          }}
          placeholder="Search"
          size="small"
          slotProps={{
            htmlInput: { 'aria-label': 'Search sessions to import' },
            input: {
              endAdornment:
                query === '' ? undefined : (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="Clear search"
                      onClick={() => {
                        setQuery('');
                      }}
                      size="small"
                    >
                      <LucideMuiIcon fontSize="small" icon={X} />
                    </IconButton>
                  </InputAdornment>
                ),
              startAdornment: (
                <InputAdornment position="start">
                  <LucideMuiIcon fontSize="small" icon={Search} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ '& .MuiInputBase-input': { py: 1.5 } }}
          value={query}
        />
      </Stack>
      {failed.length === 0 ? null : (
        <Stack direction="row" sx={{ flexShrink: 0, flexWrap: 'wrap', gap: 0.5, px: 1, pb: 0.5 }}>
          {failed.map(launchTarget => (
            <Chip
              color="error"
              key={launchTarget}
              label={`${agentLaunchTargetLabel(launchTarget)} failed — Retry`}
              onClick={() => {
                retry(launchTarget).catch(onClientError);
              }}
              size="small"
              variant="outlined"
            />
          ))}
        </Stack>
      )}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {matches.length === 0 && !loading && !hasMore ? (
          <Typography color="text.secondary" sx={{ p: 2 }} variant="body2">
            {trimmed === '' ? 'No sessions to import.' : 'No matching sessions.'}
          </Typography>
        ) : null}
        <List disablePadding>
          {matches.map(({ entry, positions }) => {
            const key = sessionEntryKey(entry);
            const selected = selectedKey === key;
            const archived = entry.archived === true;
            const title = entry.title ?? DEFAULT_SESSION_TITLE;
            const time = importRowTime(entry);
            return (
              <ListItem disablePadding key={key}>
                <Paper
                  aria-label={title}
                  elevation={0}
                  onClick={() => {
                    if (!confirming) setSelectedKey(key);
                  }}
                  role="button"
                  sx={{
                    bgcolor: selected ? 'action.selected' : 'transparent',
                    borderRadius: 0,
                    cursor: 'pointer',
                    width: '100%',
                    '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
                  }}
                  tabIndex={0}
                >
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, pl: 1, pr: 1, py: 0.5 }}>
                    <Box sx={{ display: 'inline-flex', opacity: archived ? 0.5 : 1 }}>
                      <AgentLaunchTargetIcon launchTarget={entry.launchTarget} />
                    </Box>
                    <Stack sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        color={archived ? 'text.secondary' : undefined}
                        sx={{ lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis' }}
                        variant="body2"
                      >
                        {positions === undefined ? title : <HighlightFzfChars positions={positions} text={title} />}
                      </Typography>
                      {time === undefined ? null : (
                        <Typography color="text.secondary" variant="caption">
                          {time.toLocaleString()}
                        </Typography>
                      )}
                      {rowError?.key === key ? (
                        <Typography color="error" role="alert" variant="caption">
                          {rowError.message}
                        </Typography>
                      ) : null}
                    </Stack>
                    {archived ? (
                      <LucideMuiIcon
                        icon={Archive}
                        sx={{ color: 'text.disabled', fontSize: '0.9rem' }}
                        titleAccess="Archived"
                      />
                    ) : null}
                    {selected ? (
                      <Button
                        disabled={confirming}
                        onClick={event => {
                          event.stopPropagation();
                          confirm(entry);
                        }}
                        size="small"
                        variant="contained"
                      >
                        {confirming ? <CircularProgress aria-label="Importing" size={14} /> : 'confirm'}
                      </Button>
                    ) : null}
                  </Stack>
                </Paper>
              </ListItem>
            );
          })}
        </List>
        <Box ref={sentinel} sx={{ display: 'flex', justifyContent: 'center', minHeight: 24, py: 1 }}>
          {loading ? <CircularProgress aria-label="Loading sessions" size={16} /> : null}
        </Box>
      </Box>
    </Box>
  );
};
