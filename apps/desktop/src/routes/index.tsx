import { toast, Toaster } from '@lib/ui';
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
        toast.add({ description: formatClientError(error), timeout: 6000, title: 'Error', type: 'error' });
      }}
    />
    <Toaster />
  </div>
);

export const Route = createFileRoute('/')({
  component: Index,
});
