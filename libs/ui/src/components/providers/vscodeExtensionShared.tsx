/** Hooks, copy and manual steps shared by the VS Code extension row and the launch-time update dialog. */
import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Cause } from 'effect';
import { AsyncResult } from 'effect/reactivity';
import type { FC } from 'react';

import { installVscodeExtensionAtomFn, vscodeExtensionAvailabilityAtom } from '../../atoms/boundHarnessAtoms.ts';
import type { VscodeExtensionAvailability } from '../../host/vscodeExtension.ts';

import { CommandSnippet } from './providerUi.tsx';

export const RELOAD_WINDOW_NOTE = 'Reload Window in open VS Code windows to activate it.';

/** The CLI's stderr (carried by the host failure message), not a pretty-printed cause with a stack. */
export const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const useVscodeExtensionAvailability = (): VscodeExtensionAvailability =>
  AsyncResult.getOrElse(useAtomValue(vscodeExtensionAvailabilityAtom), (): VscodeExtensionAvailability => ({
    _tag: 'Hidden',
  }));

/** Install / Update as an `AsyncResult` view: the CLI's error, or success. */
export const useInstallVscodeExtension = () => {
  const result = useAtomValue(installVscodeExtensionAtomFn);
  const install = useAtomSet(installVscodeExtensionAtomFn);
  return {
    error: AsyncResult.isFailure(result) ? failureMessage(Cause.squash(result.cause)) : undefined,
    install: () => {
      install(undefined);
    },
    installed: AsyncResult.isSuccess(result),
    installing: result.waiting,
  };
};

/** Manual fallback: the absolute `.vsix` path with a Copy button and the "Install from VSIX…" steps. */
export const ManualInstallSteps: FC<{ readonly path: string }> = ({ path }) => (
  <Stack spacing={1} sx={{ mt: 1.25 }}>
    <Typography color="text.secondary" variant="body2">
      Install it by hand: in VS Code open Extensions → … → Install from VSIX… and pick:
    </Typography>
    <CommandSnippet command={path} />
  </Stack>
);
