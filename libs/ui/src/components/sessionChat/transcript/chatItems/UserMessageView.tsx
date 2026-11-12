import { useAtomValue } from '@effect/atom-react';
import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { AsyncResult } from 'effect/reactivity';
import { ImageOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ClipboardEventHandler, FC } from 'react';

import { openFileSupportedAtom } from '../../../../atoms/boundHarnessAtoms.ts';
import { loadFileUriThumbnail } from '../../../../host/loadFileUriThumbnail.ts';
import {
  base64ImageFromDataUrl,
  classifyChatLinkHref,
  openChatImageData,
  openChatLink,
} from '../../../../host/openChatLink.ts';
import type { AvailableCommand, UserMessageImageRef } from '../../../../host/sessionUpdateReducer.ts';
import { hostRunPromise, hostRuntime } from '../../../../hostRuntime.ts';
import { LucideMuiIcon } from '../../../LucideMuiIcon.tsx';
import { ChipContent } from '../../chips/ChipContent.tsx';
import { segmentText, splitChipSegments } from '../../chips/chipSegments.ts';
import { chatLinkHandlers, useChatLinkProps } from '../../useChatLinkProps.ts';
import { CopyMessageButton } from '../CopyMessageButton.tsx';
import { ChatMarkdown } from '../markdown/ChatMarkdown.tsx';
import { escapeMarkdownBlockMarkers, hasInlineMarkdown } from '../markdown/escapeMarkdownBlockMarkers.ts';
import { prepareChatMarkdownText } from '../markdown/stripEmbeddedContextBlocks.ts';

import type { ChatItemOf } from './chatItemOf.ts';
import { chipSegmentsMarkdown, clipboardTextFromSelectionInRoot } from './userMessageClipboard.ts';

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
        <ChipContent kind="command" label={props.label} sx={{ userSelect: 'text' }} />
      ) : (
        <ChipContent href={props.href} kind="markdownLink" label={props.label} sx={{ userSelect: 'text' }} />
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

export const UserMessageView: FC<{
  readonly availableCommands: readonly AvailableCommand[];
  readonly item: ChatItemOf<'user_message'>;
}> = ({ availableCommands, item }) => {
  const { images, text } = item;
  const steering = item.steering === true;
  const segments = splitChipSegments(prepareChatMarkdownText(text), availableCommands);
  const markdown = chipSegmentsMarkdown(segments);
  const hasText = markdown.trim().length > 0;
  const hasImages = images !== undefined && images.length > 0;
  if (!hasText && !hasImages && !steering) {
    return null;
  }
  return (
    <ListItem sx={{ display: 'flex', justifyContent: 'flex-end', py: 1 }}>
      <Box sx={{ alignItems: 'flex-end', display: 'flex', flexDirection: 'column', maxWidth: 'min(85%, 42rem)' }}>
        <Box
          sx={{
            bgcolor: theme => theme.palette.userMessageBackground,
            borderRadius: 1,
            px: 1.75,
            py: 1.25,
          }}
        >
          <Stack spacing={1}>
            {steering ? (
              <Typography color="text.secondary" data-testid="transcript-steering-label" variant="caption">
                Steering
              </Typography>
            ) : null}
            {hasImages ? <TranscriptImageStrip images={images} /> : null}
            {hasText ? (
              <Box
                onCopy={onUserMessageCopy}
                sx={{ typography: 'body1', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {segments.map((segment, index) => {
                  const key = `${segment.kind}-${String(index)}`;
                  const copyText = segmentText(segment);
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
        {hasText ? <CopyMessageButton getText={() => markdown} /> : null}
      </Box>
    </ListItem>
  );
};
