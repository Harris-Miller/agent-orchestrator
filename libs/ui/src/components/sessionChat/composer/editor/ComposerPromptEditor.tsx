import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import Box from '@mui/material/Box';
import { $getRoot, defineExtension } from 'lexical';
import type { EditorThemeClasses } from 'lexical';
import { useRef, useState } from 'react';
import type { FC, JSX, RefObject } from 'react';

import type { AvailableCommand } from '../../../../host/sessionUpdateReducer.ts';

import { $getLogicalCursorAndAdjacency, $setComposerContent } from './editorDraft.ts';
import { COMPOSER_NODES } from './nodes/composerChipNode.ts';
import { BlockMarkerCaretPlugin } from './plugins/BlockMarkerCaretPlugin.tsx';
import { QuoteBarPlugin } from './plugins/QuoteBarPlugin.tsx';
import { ChipDeletePlugin } from './plugins/ChipDeletePlugin.tsx';
import { ChipifyPlugin } from './plugins/ChipifyPlugin.tsx';
import { CommandMenuKeyPlugin } from './plugins/CommandMenuKeyPlugin.tsx';
import type { ComposerCommandMenuKeyHandlers } from './plugins/CommandMenuKeyPlugin.tsx';
import { EditablePlugin } from './plugins/EditablePlugin.tsx';
import { EscapePlugin } from './plugins/EscapePlugin.tsx';
import { ExternalValuePlugin } from './plugins/ExternalValuePlugin.tsx';
import { FocusEndApiPlugin } from './plugins/FocusEndApiPlugin.tsx';
import { MarkerRevealPlugin } from './plugins/MarkerRevealPlugin.tsx';
import { SubmitOnEnterPlugin } from './plugins/SubmitOnEnterPlugin.tsx';

export type ComposerPromptChange = {
  readonly adjacentToToken: boolean;
  readonly cursor: number;
  readonly text: string;
};

export type { ComposerCommandMenuKeyHandlers };

export type ComposerPromptEditorProps = {
  readonly availableCommands?: readonly AvailableCommand[];
  readonly commandMenu?: ComposerCommandMenuKeyHandlers;
  readonly disabled: boolean;
  /** Parent assigns `() => void` that focuses the editor with the caret at root end. */
  readonly focusEndRef?: RefObject<(() => void) | null>;
  readonly onChange: (next: ComposerPromptChange) => void;
  /** Esc when no typeahead menu consumed it. Return nothing; the editor swallows the key only if set. */
  readonly onEscape?: () => void;
  readonly onSubmit: () => void;
  readonly placeholder: string;
  /** When set, applied after an external `value` sync, then cleared by the editor. */
  readonly syncCursorRef?: RefObject<null | number>;
  readonly value: string;
};

const lexicalTheme: EditorThemeClasses = {
  paragraph: 'composer-prompt-editor__paragraph',
  text: {
    bold: 'composer-md-bold',
    code: 'composer-md-code',
    italic: 'composer-md-italic',
    strikethrough: 'composer-md-strike',
  },
};

const onError = (error: Error): void => {
  console.error(error);
};

const ComposerErrorBoundary: FC<{
  readonly children: JSX.Element;
  readonly onError: (error: Error) => void;
}> = ({ children, onError: reportError }) => (
  <LexicalErrorBoundary onError={reportError}>{children}</LexicalErrorBoundary>
);

export const ComposerPromptEditor: FC<ComposerPromptEditorProps> = ({
  availableCommands = [],
  commandMenu,
  disabled,
  focusEndRef,
  onChange,
  onEscape,
  onSubmit,
  placeholder,
  syncCursorRef,
  value,
}) => {
  const lastEmittedRef = useRef(value);

  // Stable once: LexicalExtensionComposer recreates the editor if `extension` identity changes.
  // oxlint-disable-next-line react/hook-use-state -- setter unused; extension identity must stay fixed
  const [extension] = useState(() =>
    defineExtension({
      $initialEditorState: () => {
        $setComposerContent(value, availableCommands);
      },
      // EditablePlugin owns editable; starts true, flips on mount if needed.
      editable: true,
      name: 'ComposerPromptEditor',
      namespace: 'ComposerPromptEditor',
      nodes: COMPOSER_NODES,
      onError,
      theme: lexicalTheme,
    }),
  );

  return (
    <LexicalExtensionComposer contentEditable={null} extension={extension}>
      <Box
        sx={{
          '& .composer-command-chip-host, & .composer-markdown-link-chip-host': {
            display: 'inline',
            verticalAlign: 'baseline',
          },
          '& .composer-prompt-editor': {
            fontSize: '0.875rem',
            lineHeight: 1.43,
            maxHeight: 200,
            minHeight: 40,
            outline: 'none',
            overflowY: 'auto',
            px: 1.5,
            py: 1,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          },
          '& .composer-prompt-editor__paragraph': {
            m: 0,
          },
          // Markdown styling: inline markers show only while the caret is in their span; block markers never do (ordered numbers and fences do).
          '& .composer-md-strike': { textDecoration: 'line-through' },
          '& .composer-md-code, & [data-md-block="codeBlock"]': {
            bgcolor: 'action.hover',
            borderRadius: 0.5,
            fontFamily: 'monospace',
            fontSize: '0.8125rem',
          },
          '& [data-md-role="marker"], & [data-md-role="blockMarker"], & [data-md-role="fence"]': {
            color: 'text.disabled',
          },
          '& [data-md-role="marker"]:not([data-md-active]), & [data-md-role="blockMarker"]:not([data-md-block="ordered"])':
            {
              fontSize: 0,
            },
          '& [data-md-block="quote"]': { color: 'text.secondary' },
          '& [data-md-block="quote"][data-md-role="blockMarker"]::before': {
            bgcolor: 'divider',
            content: '""',
            display: 'inline-block',
            // One line box is 1.25125rem (0.875rem × 1.43). QuoteBarPlugin sets --composer-quote-lines to the visual lines the quote
            // line wraps to; the negative margin keeps the margin box one line tall so the first line box does not grow, and the bar
            // overflows down beside the wrapped lines. It sits in the editor's 12px left padding (net advance 0), so text stays aligned.
            height: 'calc(var(--composer-quote-lines, 1) * 1.25125rem)',
            marginBottom: 'calc((1 - var(--composer-quote-lines, 1)) * 1.25125rem)',
            marginLeft: '-9px',
            marginRight: '6px',
            verticalAlign: 'top',
            width: 3,
          },
          '& [data-md-block="bullet"][data-md-role="blockMarker"]::before': {
            color: 'text.secondary',
            content: '"•"',
            fontSize: '0.875rem',
            mr: 1,
          },
          '& [data-md-block="h1"]': { fontSize: '1.4em', fontWeight: 700 },
          '& [data-md-block="h2"]': { fontSize: '1.25em', fontWeight: 700 },
          '& [data-md-block="h3"]': { fontSize: '1.1em', fontWeight: 700 },
          '& [data-md-block="h4"], & [data-md-block="h5"], & [data-md-block="h6"]': { fontWeight: 700 },
          '& .composer-prompt-editor__placeholder': {
            color: 'text.secondary',
            fontSize: '0.875rem',
            left: 12,
            lineHeight: 1.43,
            overflow: 'hidden',
            pointerEvents: 'none',
            position: 'absolute',
            right: 12,
            textOverflow: 'ellipsis',
            top: 8,
            userSelect: 'none',
            whiteSpace: 'nowrap',
          },
          bgcolor: 'transparent',
          border: 0,
          borderRadius: 1,
          opacity: disabled ? 0.5 : 1,
          position: 'relative',
        }}
      >
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              aria-placeholder={placeholder}
              className="composer-prompt-editor"
              data-testid="composer-editor"
              placeholder={<div className="composer-prompt-editor__placeholder">{placeholder}</div>}
            />
          }
          ErrorBoundary={ComposerErrorBoundary}
        />
      </Box>
      <HistoryPlugin />
      {/* The chipify rebuild is history-merge tagged; it must still report (adjacentToToken closes the menu). */}
      <OnChangePlugin
        ignoreHistoryMergeTagChange={false}
        onChange={editorState => {
          editorState.read(() => {
            const text = $getRoot().getTextContent();
            const { adjacentToToken, cursor } = $getLogicalCursorAndAdjacency();
            lastEmittedRef.current = text;
            onChange({ adjacentToToken, cursor, text });
          });
        }}
      />
      <ExternalValuePlugin
        availableCommands={availableCommands}
        lastEmittedRef={lastEmittedRef}
        syncCursorRef={syncCursorRef}
        value={value}
      />
      <EditablePlugin disabled={disabled} />
      {focusEndRef === undefined ? null : <FocusEndApiPlugin focusEndRef={focusEndRef} />}
      <ChipifyPlugin availableCommands={availableCommands} />
      <MarkerRevealPlugin />
      <BlockMarkerCaretPlugin />
      <QuoteBarPlugin />
      <ChipDeletePlugin />
      {onEscape === undefined ? null : <EscapePlugin onEscape={onEscape} />}
      <SubmitOnEnterPlugin menuOpen={commandMenu?.open === true} onSubmit={onSubmit} />
      <CommandMenuKeyPlugin commandMenu={commandMenu} />
    </LexicalExtensionComposer>
  );
};
