import { useAtomMount } from '@effect/atom-react';
import type { FC } from 'react';

import { backendHarnessAtom } from '../atoms/index.ts';

export const AcpBackendsMount: FC = () => {
  useAtomMount(backendHarnessAtom('codex-acp'));
  useAtomMount(backendHarnessAtom('claude-agent-acp'));
  // disabled until I shim gemini-cli in `libs/effect-acp`
  // useAtomMount(backendHarnessAtom('gemini-cli'));
  return null;
};
