import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  directoryBasename,
  LucideMuiIcon,
  patchVirtualSessionAtomFn,
  selectedAtom,
  selectedSessionAtom,
  virtualMaterializingAtom,
  virtualSessionAtom,
} from '@lib/ui';
import Box from '@mui/material/Box';
import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { CreateSessionDirectoryPicker } from './workbenchNavRail/CreateSessionDirectoryPicker.tsx';

/** Desktop Session cwd strip (tucked by SessionChatBody aboveComposer). Clickable only for Virtual. */
export const SessionCwdStrip: FC = () => {
  const selected = useAtomValue(selectedAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const virtual = useAtomValue(virtualSessionAtom);
  const inFlight = useAtomValue(virtualMaterializingAtom);
  const patchVirtual = useAtomSet(patchVirtualSessionAtomFn, { mode: 'promise' });
  const [pickerOpen, setPickerOpen] = useState(false);

  if (selected === undefined) {
    return null;
  }

  const isVirtual = selected._tag === 'Virtual';
  const cwd = isVirtual ? virtual?.cwd : selectedSession?.cwd;
  const label = cwd === undefined ? 'Choose Project' : directoryBasename(cwd);
  const canPick = isVirtual && !inFlight;

  return (
    <>
      <Box
        component={canPick ? 'button' : 'div'}
        disabled={canPick ? false : undefined}
        onClick={
          canPick
            ? () => {
                setPickerOpen(true);
              }
            : undefined
        }
        sx={{
          '&:disabled': { opacity: 0.5 },
          '&:hover:not(:disabled)': canPick ? { color: 'text.primary' } : undefined,
          alignItems: 'center',
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: canPick ? 'pointer' : 'default',
          display: 'inline-flex',
          font: 'inherit',
          fontSize: 12,
          gap: 0.75,
          opacity: isVirtual && inFlight ? 0.5 : 1,
          p: 0,
        }}
        type={canPick ? 'button' : undefined}
      >
        <LucideMuiIcon icon={FolderOpen} sx={{ fontSize: 14 }} />
        <span>{label}</span>
      </Box>
      {pickerOpen && isVirtual ? (
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
