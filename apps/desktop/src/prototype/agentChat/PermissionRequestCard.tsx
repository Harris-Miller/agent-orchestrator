import type { RequestPermissionRequest } from '@libs/effect-acp';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { isRecord } from '../../utils.ts';

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

export const PermissionRequestCard: FC<{
  readonly agentTitle: string;
  readonly onSelect: (optionId: string) => void;
  readonly request: RequestPermissionRequest;
}> = ({ agentTitle, onSelect, request }) => (
  <Paper sx={{ bgcolor: 'action.hover', p: 2 }} variant="outlined">
    <Typography color="text.secondary" variant="caption">
      {agentTitle} needs permission
    </Typography>
    <Typography gutterBottom variant="subtitle1">
      {toolCallTitle(request)}
    </Typography>
    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
      {request.options.map(option => (
        <Button
          key={option.optionId}
          onClick={() => {
            onSelect(option.optionId);
          }}
          size="small"
          variant={option.kind.startsWith('allow') ? 'contained' : 'outlined'}
        >
          {option.name}
        </Button>
      ))}
    </Stack>
  </Paper>
);
