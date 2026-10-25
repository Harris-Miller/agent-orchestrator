import { showClientErrorToast } from '@lib/ui';
import { createFileRoute } from '@tanstack/react-router';
import type { FC } from 'react';

import { AgentChatWorkbench } from '../components/AgentChatWorkbench.tsx';

const formatClientError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

const Index: FC = () => (
  <div className="h-screen overflow-hidden">
    <AgentChatWorkbench
      onClientError={error => {
        showClientErrorToast(formatClientError(error));
      }}
    />
  </div>
);

export const Route = createFileRoute('/')({
  component: Index,
});
