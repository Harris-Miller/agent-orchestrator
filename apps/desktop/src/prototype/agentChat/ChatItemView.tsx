import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC } from 'react';

import { ChatMarkdown } from './ChatMarkdown.tsx';
import type { ChatItem } from './sessionUpdateReducer.ts';

/** body2 ≈ 0.875rem × 1.43 line-height; heights include typical result-block padding. */
const COLLAPSED_TOOL_RESULT_MAX_HEIGHT = '7.5rem'; // ~5 lines, clipped
const EXPANDED_TOOL_RESULT_MAX_HEIGHT = '26rem'; // ~20 lines, scrollable

const toolResultShellSx = {
  bgcolor: 'action.hover',
  borderRadius: 1,
  color: 'text.secondary',
  p: 1.5,
} as const;

const toolCommandMarkdownSx = {
  '& pre': {
    bgcolor: 'transparent',
    borderRadius: 0,
    mb: 0,
    overflow: 'hidden',
    p: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  bgcolor: 'transparent',
  p: 0,
} as const;

const toolResultMarkdownSx = {
  '& code': { bgcolor: 'transparent' },
  '& pre': {
    bgcolor: 'transparent',
    borderRadius: 0,
    mb: 0,
    overflow: 'auto',
    p: 0,
  },
  bgcolor: 'transparent',
  p: 0,
} as const;

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

const MessageRow: FC<{ text: string; tone: 'agent' | 'user' }> = ({ text, tone }) => {
  if (tone === 'user') {
    return (
      <ListItem sx={{ display: 'flex', justifyContent: 'flex-end', py: 1 }}>
        <Box
          sx={{
            bgcolor: theme => alpha(theme.palette.secondary.main, theme.palette.mode === 'dark' ? 0.32 : 0.18),
            borderRadius: 4,
            maxWidth: 'min(85%, 42rem)',
            px: 1.75,
            py: 1.25,
          }}
        >
          <ChatMarkdown text={text} />
        </Box>
      </ListItem>
    );
  }

  return (
    <ListItem sx={{ alignItems: 'flex-start', display: 'block', py: 1 }}>
      <ChatMarkdown text={text} />
    </ListItem>
  );
};

const ToolCallResult: FC<{ command?: string; resultText?: string }> = ({ command, resultText }) => {
  const [expanded, setExpanded] = useState(false);
  const hasCommand = command !== undefined && command.length > 0;
  const hasResult = resultText !== undefined && resultText.length > 0;

  if (!hasCommand && !hasResult) {
    return null;
  }

  return (
    <Stack spacing={0.25}>
      <Box
        sx={{
          ...toolResultShellSx,
          maxHeight: expanded ? EXPANDED_TOOL_RESULT_MAX_HEIGHT : COLLAPSED_TOOL_RESULT_MAX_HEIGHT,
          overflow: expanded ? 'auto' : 'hidden',
        }}
      >
        {hasCommand ? <ChatMarkdown sx={toolCommandMarkdownSx} text={`\`\`\`\n$ ${command}\n\`\`\``} /> : null}
        {hasResult ? <ChatMarkdown sx={toolResultMarkdownSx} text={resultText} /> : null}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <IconButton
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse tool result' : 'Expand tool result'}
          onClick={() => {
            setExpanded(current => !current);
          }}
          size="small"
        >
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
      </Box>
    </Stack>
  );
};

export const ChatItemView: FC<{ item: ChatItem }> = ({ item }) => {
  switch (item.kind) {
    case 'agent_message':
      return <MessageRow text={item.text} tone="agent" />;

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

    case 'tool_call':
      return (
        <ListItem sx={{ alignItems: 'flex-start', display: 'block' }}>
          <Paper sx={{ p: 1.5, width: '100%' }} variant="outlined">
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography sx={{ flex: 1, fontWeight: 600 }} variant="body2">
                  {item.title}
                </Typography>
                <Chip color={statusColor(item.status)} label={item.status} size="small" variant="outlined" />
              </Stack>
              {item.command !== undefined || item.resultText !== undefined ? (
                <ToolCallResult command={item.command} resultText={item.resultText} />
              ) : null}
            </Stack>
          </Paper>
        </ListItem>
      );

    case 'user_message':
      return <MessageRow text={item.text} tone="user" />;

    default:
      return null;
  }
};
