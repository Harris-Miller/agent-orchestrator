import Box from '@mui/material/Box';
import { useAtomValue } from '@effect/atom-react';
import Chip from '@mui/material/Chip';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import {
  ArrowLeftRight,
  Brain,
  FileText,
  FolderInput,
  Globe,
  ImageOff,
  Pencil,
  Search,
  SquareTerminal,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ClipboardEventHandler, FC, SyntheticEvent } from 'react';

import { loadFileUriThumbnail } from '../../host/loadFileUriThumbnail.ts';
import type { AvailableCommand, ChatItem, ToolKind, UserMessageImageRef } from '../../host/sessionUpdateReducer.ts';
import { hostRunPromise, hostRuntime } from '../../hostRuntime.ts';
import { AsyncResult } from 'effect/reactivity';
import { openFileSupportedAtom } from '../../atoms/boundHarnessAtoms.ts';
import {
  base64ImageFromDataUrl,
  classifyChatLinkHref,
  openChatImageData,
  openChatLink,
} from '../../host/openChatLink.ts';
import { LucideMuiIcon } from '../LucideMuiIcon.tsx';

import { ChatMarkdown } from './ChatMarkdown.tsx';
import { DisclosureButton, DisclosureChevron } from './DisclosureButton.tsx';
import { escapeMarkdownBlockMarkers, hasInlineMarkdown } from './escapeMarkdownBlockMarkers.ts';
import { ComposerChipContent } from './ComposerChipContent.tsx';
import { chatLinkHandlers, useChatLinkProps } from './useChatLinkProps.ts';
import { splitComposerCommandSegments } from './composerCommandTokens.ts';
import { toolCallTitleSegments } from './toolCallTitleSegments.ts';
import { prepareChatMarkdownText } from './stripEmbeddedContextBlocks.ts';
import { clipboardTextFromSelectionInRoot, segmentCopyText } from './userMessageClipboard.ts';

const THUMB_PX = 72;

const thumbBoxSx = {
  alignItems: 'center',
  bgcolor: 'action.hover',
  borderRadius: 1,
  display: 'flex',
  height: THUMB_PX,
  justifyContent: 'center',
  overflow: 'hidden',
  width: THUMB_PX,
} as const;

const BrokenImagePlaceholder: FC<{ readonly label: string }> = ({ label }) => (
  <Box aria-label={label} role="img" sx={thumbBoxSx}>
    <LucideMuiIcon icon={ImageOff} sx={{ color: 'text.disabled', fontSize: 28 }} />
  </Box>
);

const TranscriptImageTile: FC<{ readonly image: UserMessageImageRef; readonly index: number }> = ({ image, index }) => {
  const supported = useAtomValue(openFileSupportedAtom);
  const label = image.name ?? `Image ${String(index + 1)}`;
  const { previewDataUrl, uri } = image;
  const [hydratedSrc, setHydratedSrc] = useState<string | undefined>(undefined);
  const src = previewDataUrl ?? (uri?.startsWith('data:') === true ? uri : undefined) ?? hydratedSrc;

  useEffect(() => {
    if (previewDataUrl !== undefined) {
      return;
    }
    if (uri === undefined) {
      return;
    }
    if (uri.startsWith('data:')) {
      return;
    }
    if (!uri.startsWith('file://')) {
      return;
    }
    let cancelled = false;
    hostRuntime
      .runPromise(loadFileUriThumbnail(uri))
      .then(dataUrl => {
        if (!cancelled) {
          setHydratedSrc(dataUrl);
        }
      })
      .catch(() => {
        /* leave hydratedSrc undefined → broken placeholder */
      });
    return () => {
      cancelled = true;
    };
  }, [previewDataUrl, uri]);

  const tile =
    src !== undefined ? (
      <Box
        alt={label}
        component="img"
        src={src}
        sx={{
          ...thumbBoxSx,
          display: 'block',
          objectFit: 'cover',
        }}
      />
    ) : (
      <BrokenImagePlaceholder label={`Broken image: ${label}`} />
    );
  const openSupported = AsyncResult.getOrElse(supported, () => false);
  const link = uri === undefined ? { kind: 'inert' as const } : classifyChatLinkHref(uri, openSupported);
  const imageData = openSupported && src !== undefined ? base64ImageFromDataUrl(src) : undefined;
  const openEffect =
    link.kind === 'file' ? openChatLink(link) : imageData === undefined ? undefined : openChatImageData(imageData);
  if (openEffect === undefined) return tile;
  return (
    <Box
      {...chatLinkHandlers(() => {
        hostRunPromise(openEffect).catch(() => undefined);
      })}
      sx={{ cursor: 'pointer' }}
    >
      {tile}
    </Box>
  );
};

const TranscriptImageStrip: FC<{ readonly images: readonly UserMessageImageRef[] }> = ({ images }) => (
  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
    {images.map((image, index) => (
      <TranscriptImageTile image={image} index={index} key={`${image.uri ?? image.name ?? 'img'}-${String(index)}`} />
    ))}
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
  const linkProps = useChatLinkProps(props.kind === 'markdownLink' ? (props.href ?? '') : '');
  return (
    <Box
      component="span"
      data-copy-text={copyText}
      data-testid={testId}
      sx={{ display: 'inline', ...(linkProps && { cursor: 'pointer' }) }}
      {...linkProps}
    >
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
  if (middle.length === 0 || !hasInlineMarkdown(middle)) {
    return text;
  }
  return (
    <>
      {leading.length > 0 ? leading : null}
      <ChatMarkdown sx={userFragmentMarkdownSx} text={escapeMarkdownBlockMarkers(middle)} />
      {trailing.length > 0 ? trailing : null}
    </>
  );
};

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
  tone: 'agent' | 'thought' | 'user';
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
      <ChatMarkdown sx={tone === 'thought' ? { color: 'text.secondary' } : undefined} text={text} />
    </ListItem>
  );
};

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

const ToolCallRow: FC<{ item: Extract<ChatItem, { kind: 'tool_call' }> }> = ({ item }) => {
  const [open, setOpen] = useState(false);
  const expandable = item.command !== undefined || item.resultText !== undefined;
  const icon = item.toolKind === undefined ? Wrench : TOOL_KIND_ICONS[item.toolKind];
  const row = (
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
      {expandable ? <DisclosureChevron open={open} /> : null}
    </>
  );
  const rowSx = { alignItems: 'center', display: 'flex', gap: 1, width: '100%' } as const;
  return (
    <ListItem sx={{ alignItems: 'flex-start', display: 'block', py: 0 }}>
      {expandable ? (
        <>
          <DisclosureButton
            onToggle={() => {
              setOpen(current => !current);
            }}
            open={open}
            sx={{ ...rowSx, color: 'inherit', px: 0.5, py: 0.25 }}
          >
            {row}
          </DisclosureButton>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ pt: 0.5 }}>
              <ToolCallResult command={item.command} resultText={item.resultText} />
            </Box>
          </Collapse>
        </>
      ) : (
        <Box sx={{ ...rowSx, px: 0.5, py: 0.25 }}>{row}</Box>
      )}
    </ListItem>
  );
};

export const ChatItemView: FC<{
  availableCommands?: readonly AvailableCommand[];
  item: ChatItem;
}> = ({ availableCommands = [], item }) => {
  switch (item.kind) {
    case 'agent_message':
      return <MessageRow text={item.text} tone="agent" />;

    case 'agent_thought':
      return <MessageRow text={item.text} tone="thought" />;

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

    case 'elicitation_summary':
      return (
        <ListItem sx={{ alignItems: 'flex-start', display: 'block' }}>
          <Paper sx={{ p: 1.5 }} variant="outlined">
            <Typography color="text.secondary" variant="caption">
              You answered
            </Typography>
            <Typography gutterBottom variant="body2">
              {item.message}
            </Typography>
            <Stack spacing={1}>
              {item.rows.map((row, index) => (
                <div key={`${index}-${row.label}`}>
                  {row.caption === undefined ? null : (
                    <Typography color="text.secondary" sx={{ display: 'block' }} variant="caption">
                      {row.caption}
                    </Typography>
                  )}
                  <Typography variant="body2">{row.label}</Typography>
                  <Typography sx={{ fontWeight: 600 }} variant="body2">
                    {row.value}
                  </Typography>
                </div>
              ))}
            </Stack>
          </Paper>
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
      return <ToolCallRow item={item} />;

    case 'user_message':
      return <MessageRow availableCommands={availableCommands} images={item.images} text={item.text} tone="user" />;

    default:
      return null;
  }
};
