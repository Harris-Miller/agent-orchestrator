import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { patchVirtualSessionAtomFn, selectedAtom, virtualMaterializeInFlightAtom, virtualSessionAtom } from '@lib/ui';
import Button from '@mui/material/Button';
import { useState } from 'react';
import type { FC } from 'react';

import { directoryBasename } from '../directoryBasename.ts';

import { CreateSessionDirectoryPicker } from './workbenchNavRail/CreateSessionDirectoryPicker.tsx';

/** Desktop composer project chrome for Virtual session Session cwd. */
export const VirtualProjectChrome: FC = () => {
  const selected = useAtomValue(selectedAtom);
  const virtual = useAtomValue(virtualSessionAtom);
  const inFlight = useAtomValue(virtualMaterializeInFlightAtom);
  const patchVirtual = useAtomSet(patchVirtualSessionAtomFn, { mode: 'promise' });
  const [pickerOpen, setPickerOpen] = useState(false);

  if (selected?._tag !== 'Virtual') {
    return null;
  }

  const cwd = virtual?.cwd;
  const label = cwd === undefined ? 'Choose Project' : directoryBasename(cwd);

  return (
    <>
      <Button
        disabled={inFlight}
        fullWidth
        onClick={() => {
          setPickerOpen(true);
        }}
        size="small"
        sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
        variant="outlined"
      >
        {label}
      </Button>
      {pickerOpen ? (
        <CreateSessionDirectoryPicker
          onClose={() => {
            setPickerOpen(false);
          }}
          onSelectDirectory={nextCwd => {
            patchVirtual({ cwd: nextCwd }).catch(() => undefined);
          }}
        />
      ) : null}
    </>
  );
};
