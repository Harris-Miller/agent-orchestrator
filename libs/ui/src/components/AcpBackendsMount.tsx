import { useAtomMount } from '@effect/atom-react';
import type { FC } from 'react';

import { backendHarnessAtom } from '../atoms/boundHarnessAtoms.ts';

export const AcpBackendsMount: FC = () => {
  useAtomMount(backendHarnessAtom('codex-acp'));
  useAtomMount(backendHarnessAtom('claude-agent-acp'));
  // disabled until `gemini-acp` lands (Issue #42 / #47); do not mount bare `gemini-cli`
  // useAtomMount(backendHarnessAtom('gemini-cli'));
  return null;
};
