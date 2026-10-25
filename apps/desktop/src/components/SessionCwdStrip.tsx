import { useAtomSet, useAtomValue } from '@effect/atom-react';
import {
  patchVirtualSessionAtomFn,
  selectedAtom,
  selectedSessionAtom,
  virtualLifecycleInFlightAtom,
  virtualSessionAtom,
} from '@lib/ui';
import { FolderOpenIcon } from 'lucide-react';
import { useState } from 'react';
import type { FC } from 'react';

import { directoryBasename } from '../directoryBasename.ts';

import { CreateSessionDirectoryPicker } from './workbenchNavRail/CreateSessionDirectoryPicker.tsx';

/** Desktop Session cwd strip (tucked by SessionChatBody aboveComposer). Clickable only for Virtual. */
export const SessionCwdStrip: FC = () => {
  const selected = useAtomValue(selectedAtom);
  const selectedSession = useAtomValue(selectedSessionAtom);
  const virtual = useAtomValue(virtualSessionAtom);
  const inFlight = useAtomValue(virtualLifecycleInFlightAtom);
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
      {canPick ? (
        <button
          className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-xs text-inherit hover:text-foreground disabled:opacity-50"
          onClick={() => {
            setPickerOpen(true);
          }}
          type="button"
        >
          <FolderOpenIcon className="size-3.5" />
          <span>{label}</span>
        </button>
      ) : (
        <div
          className={
            isVirtual && inFlight
              ? 'inline-flex items-center gap-1.5 text-xs opacity-50'
              : 'inline-flex items-center gap-1.5 text-xs'
          }
        >
          <FolderOpenIcon className="size-3.5" />
          <span>{label}</span>
        </div>
      )}
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
