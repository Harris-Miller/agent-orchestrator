import type { FC } from 'react';

import type { AvailableCommand, ChatItem } from '../../../host/sessionUpdateReducer.ts';

import { AgentMessageView } from './chatItems/AgentMessageView.tsx';
import { AgentThoughtView } from './chatItems/AgentThoughtView.tsx';
import { ElicitationSummaryView } from './chatItems/ElicitationSummaryView.tsx';
import { PlanView } from './chatItems/PlanView.tsx';
import { RequestErrorView } from './chatItems/RequestErrorView.tsx';
import { InterSessionMessageView } from './chatItems/InterSessionMessageView.tsx';
import { SubagentItemView } from './chatItems/SubagentItemView.tsx';
import { ToolCallView } from './chatItems/ToolCallView.tsx';
import { UserMessageView } from './chatItems/UserMessageView.tsx';

export const ChatItemView: FC<{
  availableCommands?: readonly AvailableCommand[];
  item: ChatItem;
}> = ({ availableCommands = [], item }) => {
  switch (item.kind) {
    case 'agent_message':
      return <AgentMessageView text={item.text} />;

    case 'agent_thought':
      return <AgentThoughtView text={item.text} />;

    case 'elicitation_summary':
      return <ElicitationSummaryView item={item} />;

    case 'plan':
      return <PlanView item={item} />;

    case 'inter_session_message':
      return <InterSessionMessageView item={item} />;

    case 'request_error':
      return <RequestErrorView item={item} />;

    case 'subagent':
      return <SubagentItemView item={item} />;

    case 'tool_call':
      return <ToolCallView item={item} />;

    case 'user_message':
      return <UserMessageView availableCommands={availableCommands} item={item} />;

    default:
      return null;
  }
};
