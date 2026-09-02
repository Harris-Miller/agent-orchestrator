import { useAtomMount } from '@effect/atom-react';
import type { FC } from 'react';

import { backendHarnessAtom } from './acpBackendAtoms.ts';

export const AcpBackendsMount: FC = () => {
  useAtomMount(backendHarnessAtom('echo'));
  useAtomMount(backendHarnessAtom('codex-acp'));
  useAtomMount(backendHarnessAtom('claude-agent-acp'));
  return null;
};
