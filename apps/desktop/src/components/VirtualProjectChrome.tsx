import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { patchVirtualSessionAtomFn, selectedAtom, virtualMaterializeInFlightAtom, virtualSessionAtom } from '@lib/ui';
import Button from '@mui/material/Button';
import { useState } from 'react';
import type { FC } from 'react';

import { CreateSessionDirectoryPicker } from './workbenchNavRail/CreateSessionDirectoryPicker.tsx';

const directoryName = (cwd: string): string => {
  const trimmed = cwd.replace(/[/\\]+$/, '');
  const segment = trimmed.split(/[/\\]/).pop();
  return segment !== undefined && segment.length > 0 ? segment : cwd;
};

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
  const label = cwd === undefined ? 'Choose Project' : directoryName(cwd);

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
