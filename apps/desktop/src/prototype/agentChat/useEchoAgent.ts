import { createContext, useContext } from 'react';

import type { AcpAgentBackend, EchoHarnessSnapshot } from './echoAgentHarness.ts';

export type EchoAgentContextValue = {
  readonly backend: AcpAgentBackend;
  readonly sendMessage: (text: string) => Promise<void>;
  readonly setBackend: (backend: AcpAgentBackend) => void;
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
