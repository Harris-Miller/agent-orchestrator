/** Launch-time dialog offering to update an outdated VS Code extension. Independent of "Show Providers on startup". */
import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC } from 'react';

import { installVscodeExtensionAtomFn, skippedExtensionVersionAtom } from '../../atoms/boundHarnessAtoms.ts';
import { shouldOfferExtensionUpdate } from '../../host/vscodeExtension.ts';

import {
  failureMessage,
  ManualInstallSteps,
  RELOAD_WINDOW_NOTE,
  useVscodeExtensionAvailability,
} from './vscodeExtensionShared.tsx';

/** Once an update starts, the dialog owns what it shows: a refreshed availability must not close it mid-flow. */
type Update =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Done' | 'Running'; readonly version: string }
  | { readonly _tag: 'Failed'; readonly message: string; readonly path: string; readonly version: string };

export const VscodeExtensionUpdateDialog: FC = () => {
  const availability = useVscodeExtensionAvailability();
  const skipped = useAtomValue(skippedExtensionVersionAtom);
  const skip = useAtomSet(skippedExtensionVersionAtom);
  const install = useAtomSet(installVscodeExtensionAtomFn, { mode: 'promise' });
  const [update, setUpdate] = useState<Update>({ _tag: 'Idle' });
  const [open, setOpen] = useState(true);

  const offered =
    availability._tag === 'Ready' &&
    shouldOfferExtensionUpdate(availability.state, availability.bundled.version, skipped);
  if (!open || !(offered || update._tag !== 'Idle')) {
    return null;
  }
  const version =
    update._tag === 'Idle' ? (availability._tag === 'Ready' ? availability.bundled.version : '') : update.version;
  const running = update._tag === 'Running';
  const close = () => {
    setOpen(false);
  };
  const runUpdate = () => {
    if (availability._tag !== 'Ready') {
      return;
    }
    const { path, version: bundledVersion } = availability.bundled;
    setUpdate({ _tag: 'Running', version: bundledVersion });
    install(undefined).then(
      () => {
        setUpdate({ _tag: 'Done', version: bundledVersion });
      },
      (error: unknown) => {
        setUpdate({ _tag: 'Failed', message: failureMessage(error), path, version: bundledVersion });
      },
    );
  };

  return (
    <Dialog onClose={running ? undefined : close} open>
      <DialogTitle>Update the VS Code extension?</DialogTitle>
      <DialogContent>
        <Typography>
          HOA v{version} bundles a newer VS Code extension
          {availability._tag === 'Ready' && availability.installed !== undefined
            ? ` than the v${availability.installed} installed in VS Code`
            : ''}
          .
        </Typography>
        {update._tag === 'Done' ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            Updated to v{version}. {RELOAD_WINDOW_NOTE}
          </Alert>
        ) : null}
        {update._tag === 'Failed' ? (
          <>
            <Alert severity="error" sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
              {update.message}
            </Alert>
            <ManualInstallSteps path={update.path} />
          </>
        ) : null}
      </DialogContent>
      <DialogActions>
        {update._tag === 'Done' ? (
          <Button onClick={close} variant="contained">
            Close
          </Button>
        ) : (
          <>
            <Button
              disabled={running}
              onClick={() => {
                skip(version);
                close();
              }}
            >
              Skip this version
            </Button>
            <Button disabled={running} onClick={close}>
              Not now
            </Button>
            <Button disabled={running} onClick={runUpdate} variant="contained">
              Update
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};
