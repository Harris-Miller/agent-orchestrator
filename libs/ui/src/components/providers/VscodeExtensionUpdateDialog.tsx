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

import { RELOAD_WINDOW_NOTE, useVscodeExtensionAvailability } from './VscodeExtensionRow.tsx';

type Update =
  | { readonly _tag: 'Done' }
  | { readonly _tag: 'Failed'; readonly message: string }
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Running' };

export const VscodeExtensionUpdateDialog: FC = () => {
  const status = useVscodeExtensionAvailability();
  const skipped = useAtomValue(skippedExtensionVersionAtom);
  const skip = useAtomSet(skippedExtensionVersionAtom);
  const install = useAtomSet(installVscodeExtensionAtomFn, { mode: 'promise' });
  const [update, setUpdate] = useState<Update>({ _tag: 'Idle' });
  const [open, setOpen] = useState(true);

  // A successful update flips the state to up-to-date; the dialog stays up until it shows the result.
  const version = status._tag === 'Ready' ? status.bundled.version : undefined;
  const offered = status._tag === 'Ready' && shouldOfferExtensionUpdate(status.state, status.bundled.version, skipped);
  if (!open || version === undefined || !(offered || update._tag !== 'Idle')) {
    return null;
  }
  const running = update._tag === 'Running';
  const close = () => {
    setOpen(false);
  };
  const runUpdate = () => {
    setUpdate({ _tag: 'Running' });
    install(undefined).then(
      () => {
        setUpdate({ _tag: 'Done' });
      },
      (error: unknown) => {
        setUpdate({ _tag: 'Failed', message: error instanceof Error ? error.message : String(error) });
      },
    );
  };

  return (
    <Dialog onClose={running ? undefined : close} open>
      <DialogTitle>Update the VS Code extension?</DialogTitle>
      <DialogContent>
        <Typography>
          HOA v{version} bundles a newer VS Code extension
          {status._tag === 'Ready' && status.installed !== undefined
            ? ` than the v${status.installed} installed in VS Code`
            : ''}
          .
        </Typography>
        {update._tag === 'Done' ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            Updated to v{version}. {RELOAD_WINDOW_NOTE}
          </Alert>
        ) : null}
        {update._tag === 'Failed' ? (
          <Alert severity="error" sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
            {update.message}
          </Alert>
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
