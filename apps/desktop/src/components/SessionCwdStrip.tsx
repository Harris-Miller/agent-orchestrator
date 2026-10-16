import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { patchVirtualSessionAtomFn, selectedAtom, virtualMaterializeInFlightAtom, virtualSessionAtom } from '@lib/ui';
import FolderOpen from '@mui/icons-material/FolderOpen';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import Box from '@mui/material/Box';
import { useState } from 'react';
import type { FC } from 'react';

import { directoryBasename } from '../directoryBasename.ts';

import { CreateSessionDirectoryPicker } from './workbenchNavRail/CreateSessionDirectoryPicker.tsx';

/** Desktop Session cwd strip for Virtual session (tucked by SessionChatBody aboveComposer). */
export const SessionCwdStrip: FC = () => {
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
      <Box
        component="button"
        disabled={inFlight}
        onClick={() => {
          setPickerOpen(true);
        }}
        sx={{
          '&:disabled': { opacity: 0.5 },
          '&:hover:not(:disabled)': { color: 'text.primary' },
          alignItems: 'center',
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: inFlight ? 'default' : 'pointer',
          display: 'inline-flex',
          font: 'inherit',
          fontSize: 12,
          gap: 0.75,
          p: 0,
        }}
        type="button"
      >
        <FolderOpen sx={{ fontSize: 14 }} />
        <span>{label}</span>
        <KeyboardArrowDown sx={{ fontSize: 14 }} />
      </Box>
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
