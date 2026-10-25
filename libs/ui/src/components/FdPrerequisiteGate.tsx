/** Blocking bootstrap gate: require `fd` or `fdfind` on PATH before app UI. */
import { OS } from '@lib/context-services';
import { Effect, Option } from 'effect';
import { useCallback, useEffect, useState } from 'react';
import type { FC, ReactNode } from 'react';

import { fdInstallCommandsForPlatform, linuxFdInstallHintLines } from '../host/fdInstallCommands.ts';
import type { FdInstallCommand } from '../host/fdInstallCommands.ts';
import { resolveFdBinary } from '../host/resolveFdBinary.ts';
import { runFdInstallCommand } from '../host/runFdInstallCommand.ts';
import { hostRuntime } from '../hostRuntime.ts';

import { Alert, AlertDescription } from './ui/alert.tsx';
import { Button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { Spinner } from './ui/spinner.tsx';

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
    const exit = await hostRuntime.runPromiseExit(
      Effect.gen(function* () {
        const os = yield* OS;
        const found = yield* resolveFdBinary();
        return { found, platform: os.platform() } as const;
      }),
    );
    if (exit._tag === 'Failure') {
      setPhase({
        _tag: 'error',
        message: 'Could not check for fd. Close the application and try again.',
        platform: 'unknown',
      });
      return;
    }
    if (Option.isSome(exit.value.found)) {
      setPhase({ _tag: 'ready' });
      return;
    }
    setPhase({ _tag: 'missing', platform: exit.value.platform });
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
      <div className="flex items-center gap-2 p-4 text-sm">
        <Spinner className="size-[18px]" />
        Checking for fd…
      </div>
    );
  }

  const { platform } = phase;
  const installCommands = fdInstallCommandsForPlatform(platform);
  const isLinux = platform === 'linux';
  const busy = phase._tag === 'installing';
  const errorMessage = phase._tag === 'error' ? phase.message : undefined;

  return (
    <Dialog disablePointerDismissal onOpenChange={() => undefined} open>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>fd required</DialogTitle>
          <DialogDescription>
            fd is a required dependency for this application. Would you like to install now?
          </DialogDescription>
        </DialogHeader>
        {errorMessage !== undefined ? (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        {busy ? (
          <div className="flex items-center gap-2 text-sm">
            <Spinner className="size-[18px]" />
            Running {phase.label}…
          </div>
        ) : null}
        {isLinux ? (
          <ul className="m-0 list-disc pl-5 font-mono text-sm">
            {linuxFdInstallHintLines().map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <DialogFooter className="sm:justify-start">
          {!isLinux ? (
            installCommands.map(install => (
              <Button
                disabled={busy}
                key={install.label}
                onClick={() => {
                  runInstall(install, platform).catch(() => undefined);
                }}
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
            >
              Re-check PATH
            </Button>
          )}
          <Button disabled={busy} onClick={onExit} variant="outline">
            Exit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
