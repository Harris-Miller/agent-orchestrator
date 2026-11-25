import { useAtomSet, useAtomValue } from '@effect/atom-react';
import Button from '@mui/material/Button';
import { useState } from 'react';
import type { FC } from 'react';

import { patchVirtualSessionAtomFn } from '../../../atoms/boundHarnessAtoms.ts';
import { virtualMaterializingAtom, virtualSessionAtom } from '../../../atoms/virtualSession.atoms.ts';
import { AdditionalDirectoriesDialog } from '../../AdditionalDirectoriesDialog.tsx';
import { useDirectoryPicker } from '../../DirectoryPickerContext.tsx';

/**
 * The Virtual session's Additional directories for this session only, in the shared editor (the host's directory picker
 * adds, when it has one). `defaults` is what "Reset" goes back to: the Project's defaults and Workspace folders.
 */
export const VirtualDirectoriesButton: FC<{
  readonly defaults: readonly string[];
  readonly onClientError: (error: unknown) => void;
}> = ({ defaults, onClientError }) => {
  const virtual = useAtomValue(virtualSessionAtom);
  const inFlight = useAtomValue(virtualMaterializingAtom);
  const patchVirtual = useAtomSet(patchVirtualSessionAtomFn, { mode: 'promise' });
  const picker = useDirectoryPicker();
  const [open, setOpen] = useState(false);
  const count = virtual?.additionalDirectories?.length ?? 0;
  // Without a picker the editor can only remove: nothing to offer while there is nothing to remove or reset to.
  if (virtual?.cwd === undefined || inFlight || (picker === undefined && count === 0 && defaults.length === 0)) {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
        size="small"
        sx={{ color: 'text.secondary', fontSize: 12, minWidth: 0, ml: 1, p: 0, textTransform: 'none' }}
      >
        {count === 0 ? '+ directories' : `+${String(count)} directories`}
      </Button>
      {open ? (
        <AdditionalDirectoriesDialog
          description="Directories the agent may use besides the first folder, for this session only. The Project is not changed."
          initial={virtual.additionalDirectories ?? []}
          onClose={() => {
            setOpen(false);
          }}
          onReset={() => defaults}
          onSave={directories => {
            patchVirtual({ additionalDirectories: [...directories] }).catch(onClientError);
          }}
          title="Additional directories"
        />
      ) : null}
    </>
  );
};
