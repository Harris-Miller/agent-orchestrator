import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { ChatMarkdown } from '../markdown/ChatMarkdown.tsx';

/** The instruction the parent gave a subagent at spawn; the child transcript has no user prompt of its own. */
export const SubagentTaskView: FC<{ readonly task: string | undefined }> = ({ task }) =>
  task === undefined || task.trim().length === 0 ? null : (
    <ListItem data-testid="subagent-task" sx={{ display: 'block', py: 1 }}>
      <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 1 }}>
        <Typography color="text.secondary" sx={{ fontWeight: 600 }} variant="caption">
          Task
        </Typography>
        <ChatMarkdown text={task} />
      </Box>
    </ListItem>
  );
