import type { RequestPermissionRequest } from '@libs/effect-acp';
import type { FC } from 'react';

import { isRecord } from '../../isRecord.ts';
import { Button } from '../ui/button.tsx';

export const pendingRequestCardClass = 'rounded-md border border-border bg-muted p-4';

const toolCallTitle = (request: RequestPermissionRequest): string => {
  const { toolCall } = request;
  if (isRecord(toolCall) && typeof toolCall.title === 'string') {
    return toolCall.title;
  }
  if (isRecord(toolCall) && typeof toolCall.toolCallId === 'string') {
    return `Tool call ${toolCall.toolCallId}`;
  }
  return 'Tool call';
};

export const PendingPermissionCard: FC<{
  readonly agentTitle: string;
  readonly onSelect: (optionId: string) => void;
  readonly request: RequestPermissionRequest;
}> = ({ agentTitle, onSelect, request }) => (
  <div className={pendingRequestCardClass}>
    <p className="text-xs text-muted-foreground">{agentTitle} needs permission</p>
    <p className="mb-2 text-base font-medium">{toolCallTitle(request)}</p>
    <div className="flex flex-wrap gap-2">
      {request.options.map(option => (
        <Button
          key={option.optionId}
          onClick={() => {
            onSelect(option.optionId);
          }}
          size="sm"
          variant={option.kind.startsWith('allow') ? 'default' : 'outline'}
        >
          {option.name}
        </Button>
      ))}
    </div>
  </div>
);
