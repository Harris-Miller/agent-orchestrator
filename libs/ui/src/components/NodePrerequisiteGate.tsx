/** Blocking bootstrap gate: require a global Node >= 22 and npm. Cannot be dismissed; Retry re-runs the check. */
import { OpenUrl } from '@lib/context-services';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Effect } from 'effect';
import { useCallback, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';

import {
  checkNodePrerequisite,
  describeToolStatus,
  isNodePrerequisiteMet,
  MIN_NODE_MAJOR,
} from '../host/nodePrerequisite.ts';
import type { NodePrerequisite } from '../host/nodePrerequisite.ts';
import { hostRuntime } from '../hostRuntime.ts';

export const NODE_DOWNLOAD_URL = 'https://nodejs.org/en/download';

type GatePhase =
  | { readonly _tag: 'checking' }
  | { readonly _tag: 'failed'; readonly result: NodePrerequisite }
  | { readonly _tag: 'ready' };

export const NodePrerequisiteGate: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const [phase, setPhase] = useState<GatePhase>({ _tag: 'checking' });
  const [openError, setOpenError] = useState<string | undefined>(undefined);

  const probe = useCallback(async () => {
    setPhase({ _tag: 'checking' });
    const result = await hostRuntime.runPromise(checkNodePrerequisite());
    setPhase(isNodePrerequisiteMet(result) ? { _tag: 'ready' } : { _tag: 'failed', result });
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        probe().catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [probe]);

  const openDownload = useCallback(async () => {
    setOpenError(undefined);
    const exit = await hostRuntime.runPromiseExit(
      Effect.gen(function* () {
        const openUrl = yield* OpenUrl;
        yield* openUrl.open(NODE_DOWNLOAD_URL);
      }),
    );
    if (exit._tag === 'Failure') {
      setOpenError(`Could not open the browser. Visit ${NODE_DOWNLOAD_URL}`);
    }
  }, []);

  if (phase._tag === 'ready') {
    return children;
  }
  if (phase._tag === 'checking') {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2">Checking for Node.js…</Typography>
      </Stack>
    );
  }

  return (
    <Dialog fullWidth maxWidth="sm" open>
      <DialogTitle>Node.js required</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>
            This application requires Node &gt;= {MIN_NODE_MAJOR} and npm to be installed. Install them, then retry.
          </Typography>
          <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
            <Typography component="li" variant="body2">
              {describeToolStatus('node', phase.result.node)}
            </Typography>
            <Typography component="li" variant="body2">
              {describeToolStatus('npm', phase.result.npm)}
            </Typography>
          </Stack>
          {openError === undefined ? null : <Alert severity="error">{openError}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ gap: 1, justifyContent: 'flex-start', pb: 2, px: 3 }}>
        <Button
          onClick={() => {
            openDownload().catch(() => undefined);
          }}
          variant="contained"
        >
          Download Node.js
        </Button>
        <Button
          onClick={() => {
            probe().catch(() => undefined);
          }}
          variant="outlined"
        >
          Retry
        </Button>
      </DialogActions>
    </Dialog>
  );
};
