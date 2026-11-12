import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import {
  ArrowLeftRight,
  Brain,
  FileText,
  FolderInput,
  Globe,
  Pencil,
  Search,
  SquareTerminal,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { FC, SyntheticEvent } from 'react';

import type { ToolKind } from '../../../../host/sessionUpdateReducer.ts';
import { LucideMuiIcon } from '../../../LucideMuiIcon.tsx';
import { useChatLinkProps } from '../../useChatLinkProps.ts';
import { DisclosureButton, DisclosureChevron, DisclosureChevronSpacer } from '../DisclosureButton.tsx';
import { ChatMarkdown } from '../markdown/ChatMarkdown.tsx';

import type { ChatItemOf } from './chatItemOf.ts';
import { toolCallTitleSegments } from './toolCallTitleSegments.ts';

/** body2 ≈ 0.875rem × 1.43 line-height; heights include typical result-block padding. */
const TOOL_RESULT_MAX_HEIGHT = '26rem'; // ~20 lines, scrollable

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
    m: 0,
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
    m: 0,
    overflow: 'auto',
    p: 0,
  },
  bgcolor: 'transparent',
  p: 0,
} as const;

const ToolCallResult: FC<{ command?: string; resultText?: string }> = ({ command, resultText }) => {
  const hasCommand = command !== undefined && command.length > 0;
  const hasResult = resultText !== undefined && resultText.length > 0;

  if (!hasCommand && !hasResult) {
    return null;
  }

  return (
    <Stack spacing={0.5}>
      {hasCommand ? (
        <Box sx={toolResultShellSx}>
          <ChatMarkdown sx={toolCommandMarkdownSx} text={`\`\`\`\n$ ${command}\n\`\`\``} />
        </Box>
      ) : null}
      {hasResult ? (
        <Box sx={{ ...toolResultShellSx, maxHeight: TOOL_RESULT_MAX_HEIGHT, overflow: 'auto' }}>
          <ChatMarkdown sx={toolResultMarkdownSx} text={resultText} />
        </Box>
      ) : null}
    </Stack>
  );
};

const TOOL_KIND_ICONS: Record<ToolKind, LucideIcon> = {
  delete: Trash2,
  edit: Pencil,
  execute: SquareTerminal,
  fetch: Globe,
  move: FolderInput,
  other: Wrench,
  read: FileText,
  search: Search,
  switch_mode: ArrowLeftRight,
  think: Brain,
};

/** Wrap a handler so the event does not reach the enclosing disclosure button. */
const stopThen =
  <E extends SyntheticEvent>(handler: (event: E) => void) =>
  (event: E): void => {
    event.stopPropagation();
    handler(event);
  };

/** Link inside a disclosure row: opening it must not toggle the row. */
const TitleLink: FC<{ href: string; text: string }> = ({ href, text }) => {
  const linkProps = useChatLinkProps(href);
  return (
    <Box
      component="span"
      sx={{ color: 'primary.main', textDecoration: 'underline', ...(linkProps && { cursor: 'pointer' }) }}
      {...linkProps}
      onClick={linkProps && stopThen(linkProps.onClick)}
      onKeyDown={linkProps && stopThen(linkProps.onKeyDown)}
    >
      {text}
    </Box>
  );
};

/** `preview`: header row only, never expandable (collapsed Work region's latest item). */
export const ToolCallView: FC<{ item: ChatItemOf<'tool_call'>; preview?: boolean }> = ({ item, preview = false }) => {
  const [open, setOpen] = useState(false);
  const expandable = !preview && (item.command !== undefined || item.resultText !== undefined);
  const icon = item.toolKind === undefined ? Wrench : TOOL_KIND_ICONS[item.toolKind];
  const header = (
    <>
      <LucideMuiIcon icon={icon} sx={{ color: 'text.secondary', fontSize: 16 }} />
      <Typography noWrap sx={{ flex: 1, textAlign: 'left' }} variant="body2">
        {toolCallTitleSegments(item).map((segment, index) =>
          !('href' in segment) ? (
            segment.text
          ) : (
            // eslint-disable-next-line react/no-array-index-key
            <TitleLink href={segment.href} key={index} text={segment.text} />
          ),
        )}
      </Typography>
      {item.status !== 'completed' ? (
        <Typography
          color={item.status === 'failed' ? 'error' : 'text.secondary'}
          sx={{ flexShrink: 0 }}
          variant="caption"
        >
          {item.status}
        </Typography>
      ) : null}
      {expandable ? <DisclosureChevron open={open} /> : <DisclosureChevronSpacer />}
    </>
  );
  const headerSx = { alignItems: 'center', display: 'flex', gap: 1, width: '100%' } as const;
  return (
    <ListItem sx={{ alignItems: 'flex-start', display: 'block', py: 0 }}>
      {expandable ? (
        <>
          <DisclosureButton
            onToggle={() => {
              setOpen(current => !current);
            }}
            open={open}
            sx={{ ...headerSx, color: 'inherit', px: 0.5, py: 0.25 }}
          >
            {header}
          </DisclosureButton>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ pt: 0.5 }}>
              <ToolCallResult command={item.command} resultText={item.resultText} />
            </Box>
          </Collapse>
        </>
      ) : (
        <Box sx={{ ...headerSx, px: 0.5, py: 0.25 }}>{header}</Box>
      )}
    </ListItem>
  );
};
