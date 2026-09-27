import { useAtomMount } from '@effect/atom-react';
import { backendHarnessAtom } from '@lib/ui';
import type { FC } from 'react';

export const AcpBackendsMount: FC = () => {
  useAtomMount(backendHarnessAtom('codex-acp'));
  useAtomMount(backendHarnessAtom('claude-agent-acp'));
  // disabled until I shim gemini-cli in `libs/effect-acp`
  // useAtomMount(backendHarnessAtom('gemini-cli'));
  return null;
};
