/** Blocking bootstrap gate: require `fd` or `fdfind` on PATH before app UI. */
import { OS } from '@lib/context-services';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Effect, Option } from 'effect';
import { useCallback, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { fdInstallCommandsForPlatform, linuxFdInstallHintLines } from '../host/fdInstallCommands.ts';
import type { FdInstallCommand } from '../host/fdInstallCommands.ts';
import { resolveFdBinary } from '../host/resolveFdBinary.ts';
import { runFdInstallCommand } from '../host/runFdInstallCommand.ts';
import { hostRuntime } from '../hostRuntime.ts';

type GatePhase =
  | { readonly _tag: 'checking' }
  | { readonly _tag: 'error'; readonly message: string; readonly platform: string }
  | { readonly _tag: 'installing'; readonly label: string; readonly platform: string }
  | { readonly _tag: 'missing'; readonly platform: string }
  | { readonly _tag: 'ready' };

export type FdPrerequisiteGateProps = {
  readonly children: ReactNode;
  /** Host-owned exit (desktop: close window; VS Code: dismiss / reload). */
  readonly onExit: () => void;
};

export const FdPrerequisiteGate: FC<FdPrerequisiteGateProps> = ({ children, onExit }) => {
  const [phase, setPhase] = useState<GatePhase>({ _tag: 'checking' });

  const probe = useCallback(async () => {
    setPhase({ _tag: 'checking' });
    const result = await hostRuntime.runPromise(
      Effect.gen(function* () {
        const os = yield* OS;
        const found = yield* resolveFdBinary();
        return { found, platform: os.platform() } as const;
      }),
    );
    if (Option.isSome(result.found)) {
      setPhase({ _tag: 'ready' });
      return;
    }
    setPhase({ _tag: 'missing', platform: result.platform });
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) {
        return;
      }
      probe().catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [probe]);

  const runInstall = useCallback(async (install: FdInstallCommand, platform: string) => {
    setPhase({ _tag: 'installing', label: install.label, platform });
    const exit = await hostRuntime.runPromiseExit(runFdInstallCommand(install));
    if (exit._tag === 'Failure') {
      setPhase({
        _tag: 'error',
        message: 'Could not install. Close the application and install manually, then try again.',
        platform,
      });
      return;
    }
    const found = await hostRuntime.runPromise(resolveFdBinary());
    if (Option.isNone(found)) {
      setPhase({
        _tag: 'error',
        message:
          'fd was installed successfully, but is not available on PATH. Close this app, fix manually, then try again.',
        platform,
      });
      return;
    }
    setPhase({ _tag: 'ready' });
  }, []);

  if (phase._tag === 'ready') {
    return children;
  }

  if (phase._tag === 'checking') {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="body2">Checking for fd…</Typography>
      </Stack>
    );
  }

  const { platform } = phase;
  const installCommands = fdInstallCommandsForPlatform(platform);
  const isLinux = platform === 'linux';
  const busy = phase._tag === 'installing';
  const errorMessage = phase._tag === 'error' ? phase.message : undefined;

  return (
    <Dialog fullWidth maxWidth="sm" open>
      <DialogTitle>fd required</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>fd is a required dependency for this application. Would you like to install now?</Typography>
          {errorMessage !== undefined ? <Alert severity="error">{errorMessage}</Alert> : null}
          {busy ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <CircularProgress size={18} />
              <Typography variant="body2">Running {phase.label}…</Typography>
            </Stack>
          ) : null}
          {isLinux ? (
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {linuxFdInstallHintLines().map(line => (
                <Typography component="li" key={line} sx={{ fontFamily: 'monospace' }} variant="body2">
                  {line}
                </Typography>
              ))}
            </Box>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1, justifyContent: 'flex-start', pb: 2, px: 3 }}>
        {!isLinux ? (
          installCommands.map(install => (
            <Button
              disabled={busy}
              key={install.label}
              onClick={() => {
                runInstall(install, platform).catch(() => undefined);
              }}
              variant="contained"
            >
              {install.label}
            </Button>
          ))
        ) : (
          <Button
            disabled={busy}
            onClick={() => {
              probe().catch(() => undefined);
            }}
            variant="contained"
          >
            Re-check PATH
          </Button>
        )}
        <Button disabled={busy} onClick={onExit} variant="outlined">
          Exit
        </Button>
      </DialogActions>
    </Dialog>
  );
};
