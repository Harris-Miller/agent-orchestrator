import { LexicalComposer } from '@lexical/react/LexicalComposer';
import type { InitialConfigType } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import Box from '@mui/material/Box';
import {
  $createParagraphNode,
  $generateNodesFromRawText,
  $getRoot,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
} from 'lexical';
import type { EditorThemeClasses } from 'lexical';
import { useEffect, useMemo, useRef } from 'react';
import type { FC, JSX, RefObject } from 'react';

export type ComposerPromptEditorProps = {
  readonly disabled: boolean;
  readonly onChange: (next: string) => void;
  readonly onSubmit: () => void;
  readonly placeholder: string;
  readonly value: string;
};

const lexicalTheme: EditorThemeClasses = {
  paragraph: 'composer-prompt-editor__paragraph',
};

const onError = (error: Error): void => {
  console.error(error);
};

const $setComposerPlainText = (text: string): void => {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  if (text.length > 0) {
    paragraph.append(...$generateNodesFromRawText(text));
  }
  root.append(paragraph);
};

const ComposerErrorBoundary: FC<{
  readonly children: JSX.Element;
  readonly onError: (error: Error) => void;
}> = ({ children, onError: reportError }) => (
  <LexicalErrorBoundary onError={reportError}>{children}</LexicalErrorBoundary>
);

const EditablePlugin: FC<{ readonly disabled: boolean }> = ({ disabled }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return null;
};

const ExternalValuePlugin: FC<{
  readonly lastEmittedRef: RefObject<string>;
  readonly value: string;
}> = ({ lastEmittedRef, value }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (value === lastEmittedRef.current) {
      return;
    }

    editor.update(() => {
      if ($getRoot().getTextContent() === value) {
        lastEmittedRef.current = value;
        return;
      }
      $setComposerPlainText(value);
      lastEmittedRef.current = value;
    });
  }, [editor, lastEmittedRef, value]);

  return null;
};

const SubmitOnEnterPlugin: FC<{ readonly onSubmit: () => void }> = ({ onSubmit }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        event => {
          if (event === null || event.shiftKey) {
            return false;
          }
          event.preventDefault();
          onSubmit();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, onSubmit],
  );

  return null;
};

export const ComposerPromptEditor: FC<ComposerPromptEditorProps> = ({
  disabled,
  onChange,
  onSubmit,
  placeholder,
  value,
}) => {
  const initialValueRef = useRef(value);
  const lastEmittedRef = useRef(value);

  const initialConfig = useMemo(
    (): InitialConfigType => ({
      // EditablePlugin owns editable; starts true, flips on mount if needed.
      editable: true,
      editorState: () => {
        $setComposerPlainText(initialValueRef.current);
      },
      namespace: 'ComposerPromptEditor',
      // Custom DecoratorNodes (mentions, skills, …) register here later.
      nodes: [],
      onError,
      theme: lexicalTheme,
    }),
    [],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <Box
        sx={{
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
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
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
      <OnChangePlugin
        ignoreSelectionChange
        onChange={editorState => {
          editorState.read(() => {
            const next = $getRoot().getTextContent();
            if (next === lastEmittedRef.current) {
              return;
            }
            lastEmittedRef.current = next;
            onChange(next);
          });
        }}
      />
      <ExternalValuePlugin lastEmittedRef={lastEmittedRef} value={value} />
      <EditablePlugin disabled={disabled} />
      <SubmitOnEnterPlugin onSubmit={onSubmit} />
    </LexicalComposer>
  );
};
