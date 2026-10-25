import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { useState } from 'react';
import type { ClipboardEventHandler, FC } from 'react';

import type { AvailableCommand, ChatItem } from '../../host/sessionUpdateReducer.ts';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';

import { ChatMarkdown } from './ChatMarkdown.tsx';
import { ComposerChipContent } from './ComposerChipContent.tsx';
import { splitComposerCommandSegments } from './composerCommandTokens.ts';
import { prepareChatMarkdownText } from './stripEmbeddedContextBlocks.ts';
import { clipboardTextFromSelectionInRoot, segmentCopyText } from './userMessageClipboard.ts';

/** Transcript chips must be selectable so copy includes them; composer keeps userSelect: none. */
type TranscriptChipProps = {
  readonly copyText: string;
  readonly label: string;
  readonly testId: string;
} & ({ readonly href?: string; readonly kind: 'markdownLink' } | { readonly kind: 'command' });

const TranscriptChip: FC<TranscriptChipProps> = props => {
  const { copyText, testId } = props;
  return (
    <span className="inline" data-copy-text={copyText} data-testid={testId}>
      {props.kind === 'command' ? (
        <ComposerChipContent kind="command" label={props.label} sx={{ userSelect: 'text' }} />
      ) : (
        <ComposerChipContent href={props.href} kind="markdownLink" label={props.label} sx={{ userSelect: 'text' }} />
      )}
    </span>
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
      <ChatMarkdown className="inline [&_p]:m-0 [&_p]:inline" text={middle} />
      {trailing.length > 0 ? trailing : null}
    </>
  );
};

/** body2 ≈ 0.875rem × 1.43 line-height; heights include typical result-block padding. */
const COLLAPSED_TOOL_RESULT_MAX_HEIGHT = '7.5rem'; // ~5 lines, clipped
const EXPANDED_TOOL_RESULT_MAX_HEIGHT = '26rem'; // ~20 lines, scrollable

const statusClass = (status: string | undefined): string => {
  switch (status) {
    case 'completed':
      return 'border-primary text-primary';
    case 'failed':
      return 'border-destructive text-destructive';
    case 'in_progress':
      return 'border-ring text-foreground';
    case 'pending':
      return 'border-muted-foreground text-muted-foreground';
    case 'cancelled':
    case undefined:
    default:
      return '';
  }
};

const MessageRow: FC<{
  availableCommands?: readonly AvailableCommand[];
  text: string;
  tone: 'agent' | 'user';
}> = ({ availableCommands = [], text, tone }) => {
  if (tone === 'user') {
    const segments = splitComposerCommandSegments(prepareChatMarkdownText(text), availableCommands);
    return (
      <div className="flex justify-end py-2">
        <div className="max-w-[min(85%,42rem)] rounded-md bg-secondary px-3.5 py-2.5">
          <div className="text-base break-words whitespace-pre-wrap" onCopy={onUserMessageCopy}>
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-2">
      <ChatMarkdown text={text} />
    </div>
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
    <div className="flex flex-col gap-0.5">
      <div
        className={
          expanded
            ? 'overflow-auto rounded-md bg-muted p-3 text-muted-foreground'
            : 'overflow-hidden rounded-md bg-muted p-3 text-muted-foreground'
        }
        style={{ maxHeight: expanded ? EXPANDED_TOOL_RESULT_MAX_HEIGHT : COLLAPSED_TOOL_RESULT_MAX_HEIGHT }}
      >
        {hasCommand ? (
          <ChatMarkdown
            className="bg-transparent p-0 [&_pre]:mb-0 [&_pre]:overflow-hidden [&_pre]:bg-transparent [&_pre]:p-0 [&_pre]:break-words [&_pre]:whitespace-pre-wrap"
            text={`\`\`\`\n$ ${command}\n\`\`\``}
          />
        ) : null}
        {hasResult ? (
          <ChatMarkdown
            className="bg-transparent p-0 [&_code]:bg-transparent [&_pre]:mb-0 [&_pre]:bg-transparent [&_pre]:p-0"
            text={resultText}
          />
        ) : null}
      </div>
      <div className="flex justify-end">
        <Button
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse tool result' : 'Expand tool result'}
          onClick={() => {
            setExpanded(current => !current);
          }}
          size="icon-sm"
          variant="ghost"
        >
          {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
      </div>
    </div>
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
        <div className="py-2">
          <p className="mb-2 text-sm font-semibold">Config</p>
          <div className="flex flex-col gap-2">
            {item.options.map(option => (
              <div key={`${item.id}-${option.id}`}>
                <p className="text-sm">
                  {option.name}: <strong>{option.currentValue ?? '—'}</strong>
                </p>
                {option.type !== undefined ? <p className="text-xs text-muted-foreground">{option.type}</p> : null}
              </div>
            ))}
          </div>
        </div>
      );

    case 'plan':
      return (
        <div className="py-2">
          <p className="mb-2 text-sm font-semibold">Plan</p>
          <div className="flex flex-col gap-2">
            {item.entries.map(entry => (
              <div className="rounded-md border border-border p-3" key={`${item.id}-${entry.content}`}>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-sm">{entry.content}</p>
                  {entry.status !== undefined ? (
                    <Badge className={statusClass(entry.status)} variant="outline">
                      {entry.status}
                    </Badge>
                  ) : null}
                  {entry.priority !== undefined ? <Badge variant="outline">{entry.priority}</Badge> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'tool_call':
      return (
        <div className="py-2">
          <div className="w-full rounded-md border border-border p-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-semibold">{item.title}</p>
                <Badge className={statusClass(item.status)} variant="outline">
                  {item.status}
                </Badge>
              </div>
              {item.command !== undefined || item.resultText !== undefined ? (
                <ToolCallResult command={item.command} resultText={item.resultText} />
              ) : null}
            </div>
          </div>
        </div>
      );

    case 'user_message':
      return <MessageRow availableCommands={availableCommands} text={item.text} tone="user" />;

    default:
      return null;
  }
};
