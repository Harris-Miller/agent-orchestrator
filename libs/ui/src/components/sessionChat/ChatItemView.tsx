import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { ClipboardEventHandler, FC } from 'react';

import type { AvailableCommand, ChatItem, UserMessageImageRef } from '../../host/sessionUpdateReducer.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { ChatMarkdown } from './ChatMarkdown.tsx';
import { ComposerChipContent } from './ComposerChipContent.tsx';
import { splitComposerCommandSegments } from './composerCommandTokens.ts';
import { prepareChatMarkdownText } from './stripEmbeddedContextBlocks.ts';
import { clipboardTextFromSelectionInRoot, segmentCopyText } from './userMessageClipboard.ts';

const TranscriptImageStrip: FC<{ readonly images: readonly UserMessageImageRef[] }> = ({ images }) => (
  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
    {images.map((image, index) => {
      const src = image.thumbnailDataUrl;
      if (src === undefined) {
        return null;
      }
      return (
        <Box
          alt={image.name ?? `Image ${String(index + 1)}`}
          component="img"
          key={`${image.uri ?? image.name ?? 'img'}-${String(index)}`}
          src={src}
          sx={{
            borderRadius: 1,
            display: 'block',
            height: 72,
            objectFit: 'cover',
            width: 72,
          }}
        />
      );
    })}
  </Stack>
);

const userFragmentMarkdownSx = {
  '& p': { display: 'inline', m: 0 },
  display: 'inline',
} as const;

/** Transcript chips must be selectable so copy includes them; composer keeps userSelect: none. */
type TranscriptChipProps = {
  readonly copyText: string;
  readonly label: string;
  readonly testId: string;
} & ({ readonly href?: string; readonly kind: 'markdownLink' } | { readonly kind: 'command' });

const TranscriptChip: FC<TranscriptChipProps> = props => {
  const { copyText, testId } = props;
  return (
    <Box component="span" data-copy-text={copyText} data-testid={testId} sx={{ display: 'inline' }}>
      {props.kind === 'command' ? (
        <ComposerChipContent kind="command" label={props.label} sx={{ userSelect: 'text' }} />
      ) : (
        <ComposerChipContent href={props.href} kind="markdownLink" label={props.label} sx={{ userSelect: 'text' }} />
      )}
    </Box>
  );
};

const onUserMessageCopy: ClipboardEventHandler<HTMLElement> = event => {
  const text = clipboardTextFromSelectionInRoot(event.currentTarget);
  if (text === null) {
    return;
  }
  event.preventDefault();
  event.clipboardData.setData('text/plain', text);
};

/** Keep edge whitespace outside ChatMarkdown — react-markdown trims it from <p> text. */
const UserTextFragment: FC<{ text: string }> = ({ text }) => {
  const leading = /^(\s*)/.exec(text)?.[1] ?? '';
  if (leading.length === text.length) {
    return text;
  }
  const trailing = /(\s*)$/.exec(text)?.[1] ?? '';
  const middle = text.slice(leading.length, text.length - trailing.length);
  // Plain text must stay a text node (same line metrics as chips). ChatMarkdown's inline <p>
  // wrapper shifts the baseline and makes neighboring chips look high/low.
  if (middle.length === 0 || !/[*_~`[\]]/.test(middle)) {
    return text;
  }
  return (
    <>
      {leading.length > 0 ? leading : null}
      <ChatMarkdown sx={userFragmentMarkdownSx} text={middle} />
      {trailing.length > 0 ? trailing : null}
    </>
  );
};

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
    case 'cancelled':
      return 'default';
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

const MessageRow: FC<{
  availableCommands?: readonly AvailableCommand[];
  images?: readonly UserMessageImageRef[];
  text: string;
  tone: 'agent' | 'user';
}> = ({ availableCommands = [], images, text, tone }) => {
  if (tone === 'user') {
    const segments = splitComposerCommandSegments(prepareChatMarkdownText(text), availableCommands);
    const hasText = text.length > 0;
    const hasImages = images !== undefined && images.length > 0;
    return (
      <ListItem sx={{ display: 'flex', justifyContent: 'flex-end', py: 1 }}>
        <Box
          sx={{
            bgcolor: theme => alpha(theme.palette.secondary.main, theme.palette.mode === 'dark' ? 0.32 : 0.18),
            borderRadius: 1,
            maxWidth: 'min(85%, 42rem)',
            px: 1.75,
            py: 1.25,
          }}
        >
          <Stack spacing={1}>
            {hasImages ? <TranscriptImageStrip images={images} /> : null}
            {hasText ? (
              <Box
                onCopy={onUserMessageCopy}
                sx={{ typography: 'body1', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {segments.map((segment, index) => {
                  const key = `${segment.kind}-${String(index)}`;
                  const copyText = segmentCopyText(segment);
                  if (segment.kind === 'command') {
                    return (
                      <TranscriptChip
                        copyText={copyText}
                        key={key}
                        kind="command"
                        label={segment.value}
                        testId="transcript-command-chip"
                      />
                    );
                  }
                  if (segment.kind === 'markdownLink') {
                    return (
                      <TranscriptChip
                        copyText={copyText}
                        href={segment.href}
                        key={key}
                        kind="markdownLink"
                        label={segment.label}
                        testId="transcript-markdown-link-chip"
                      />
                    );
                  }
                  return <UserTextFragment key={key} text={segment.value} />;
                })}
              </Box>
            ) : null}
          </Stack>
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
          {expanded ? (
            <LucideMuiIcon fontSize="small" icon={ChevronUp} />
          ) : (
            <LucideMuiIcon fontSize="small" icon={ChevronDown} />
          )}
        </IconButton>
      </Box>
    </Stack>
  );
};

export const ChatItemView: FC<{
  availableCommands?: readonly AvailableCommand[];
  item: ChatItem;
}> = ({ availableCommands = [], item }) => {
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
      return <MessageRow availableCommands={availableCommands} images={item.images} text={item.text} tone="user" />;

    default:
      return null;
  }
};
