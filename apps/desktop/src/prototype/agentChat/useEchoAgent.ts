import { createContext, useContext } from 'react';

import type { EchoHarnessSnapshot } from './echoAgentHarness.ts';

export type EchoAgentContextValue = {
  readonly sendMessage: (text: string) => Promise<void>;
  readonly snapshot: EchoHarnessSnapshot;
};

export const EchoAgentContext = createContext<EchoAgentContextValue | null>(null);

export const useEchoAgent = (): EchoAgentContextValue => {
  const value = useContext(EchoAgentContext);
  if (value === null) {
    throw new Error('useEchoAgent must be used within EchoAgentProvider');
  }
  return value;
};
