/** Pieces shared by the bootstrap gates: deferred startup work, the progress row, and the error + Retry block. */
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect } from 'react';
import type { DependencyList, FC } from 'react';

/**
 * Run `task` once per `deps` change, deferred a microtask so it never sets state during render. `isCancelled` turns
 * true on unmount or when `deps` change; check it before applying results. Rejections are swallowed: tasks report
 * their own failures through state.
 */
export const useStartupTask = (task: (isCancelled: () => boolean) => Promise<unknown>, deps: DependencyList): void => {
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        task(() => cancelled).catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- deps are the caller's
  }, deps);
};

export const GateProgress: FC<{ readonly label: string }> = ({ label }) => (
  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 2 }}>
    <CircularProgress size={18} />
    <Typography variant="body2">{label}</Typography>
  </Stack>
);

export const GateRetry: FC<{ readonly message: string; readonly onRetry: () => void }> = ({ message, onRetry }) => (
  <Stack spacing={1} sx={{ p: 2 }}>
    <Alert severity="error">{message}</Alert>
    <Button onClick={onRetry} sx={{ alignSelf: 'flex-start' }} variant="contained">
      Retry
    </Button>
  </Stack>
);
