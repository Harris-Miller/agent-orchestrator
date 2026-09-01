import { createFileRoute } from '@tanstack/react-router';

import { AgentChatPrototype } from '../prototype/agentChat/AgentChatPrototype.tsx';

export const Route = createFileRoute('/')({
  component: AgentChatPrototype,
});
