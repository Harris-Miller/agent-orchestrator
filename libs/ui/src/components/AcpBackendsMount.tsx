import { useAtomMount } from '@effect/atom-react';
import type { FC } from 'react';

import { backendHarnessAtom } from '../atoms/boundHarnessAtoms.ts';

export const AcpBackendsMount: FC = () => {
  useAtomMount(backendHarnessAtom('codex-acp'));
  useAtomMount(backendHarnessAtom('claude-agent-acp'));
  useAtomMount(backendHarnessAtom('gemini-acp'));
  return null;
};
