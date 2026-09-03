import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { FC } from 'react';

import { ChatMarkdown } from './ChatMarkdown.tsx';
import type { ChatItem } from './sessionUpdateReducer.ts';

const statusColor = (status: string | undefined): 'default' | 'error' | 'info' | 'success' | 'warning' => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
      return 'error';
    case 'in_progress':
      return 'info';
    case 'pending':
      return 'warning';
    case undefined:
    default:
      return 'default';
  }
};

const MessageRow: FC<{ label: string; text: string; tone: 'agent' | 'user' }> = ({ label, text, tone }) => (
  <ListItem sx={{ alignItems: 'flex-start', display: 'block' }}>
    <Typography
      sx={{ color: tone === 'user' ? 'primary.main' : 'text.primary', fontWeight: 600, mb: 0.5 }}
      variant="body2"
    >
      {label}
    </Typography>
    <ChatMarkdown text={text} />
  </ListItem>
);

export const ChatItemView: FC<{ item: ChatItem }> = ({ item }) => {
  switch (item.kind) {
    case 'agent_message':
      return <MessageRow label="Agent" text={item.text} tone="agent" />;

    case 'config_options':
      return (
        <ListItem sx={{ alignItems: 'flex-start', display: 'block' }}>
          <Typography sx={{ fontWeight: 600, mb: 1 }} variant="body2">
            Config
          </Typography>
          <Stack spacing={1}>
            {item.options.map(option => (
              <Box key={`${item.id}-${option.id}`}>
                <Typography variant="body2">
                  {option.name}: <strong>{option.currentValue ?? '—'}</strong>
                </Typography>
                {option.type !== undefined ? (
                  <Typography color="text.secondary" variant="caption">
                    {option.type}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Stack>
        </ListItem>
      );

    case 'plan':
      return (
        <ListItem sx={{ alignItems: 'flex-start', display: 'block' }}>
          <Typography sx={{ fontWeight: 600, mb: 1 }} variant="body2">
            Plan
          </Typography>
          <Stack spacing={1}>
            {item.entries.map(entry => (
              <Paper key={`${item.id}-${entry.content}`} sx={{ p: 1.5 }} variant="outlined">
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography sx={{ flex: 1 }} variant="body2">
                    {entry.content}
                  </Typography>
                  {entry.status !== undefined ? (
                    <Chip color={statusColor(entry.status)} label={entry.status} size="small" variant="outlined" />
                  ) : null}
                  {entry.priority !== undefined ? (
                    <Chip label={entry.priority} size="small" variant="outlined" />
                  ) : null}
                </Stack>
              </Paper>
            ))}
          </Stack>
        </ListItem>
      );

    case 'session_info':
      return (
        <ListItem>
          <ListItemText
            primary="Session"
            secondary={[item.title, item.updatedAt].filter(value => value !== undefined).join(' · ')}
            slotProps={{
              primary: { sx: { fontWeight: 600 } },
              secondary: { sx: { color: 'text.secondary', fontStyle: 'italic' } },
            }}
          />
        </ListItem>
      );

    case 'tool_call':
      return (
        <ListItem sx={{ alignItems: 'flex-start', display: 'block' }}>
          <Paper sx={{ p: 1.5, width: '100%' }} variant="outlined">
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography sx={{ flex: 1, fontWeight: 600 }} variant="body2">
                  Tool: {item.title}
                </Typography>
                <Chip color={statusColor(item.status)} label={item.status} size="small" variant="outlined" />
              </Stack>
              {item.toolKind !== undefined ? (
                <Typography color="text.secondary" variant="caption">
                  kind: {item.toolKind}
                </Typography>
              ) : null}
              {item.resultText !== undefined ? (
                <Typography sx={{ whiteSpace: 'pre-wrap' }} variant="body2">
                  {item.resultText}
                </Typography>
              ) : null}
            </Stack>
          </Paper>
        </ListItem>
      );

    case 'user_message':
      return <MessageRow label="You" text={item.text} tone="user" />;

    default:
      return null;
  }
};
