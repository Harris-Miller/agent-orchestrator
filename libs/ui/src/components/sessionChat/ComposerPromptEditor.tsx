import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import Box from '@mui/material/Box';
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  defineExtension,
  DELETE_CHARACTER_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_SPACE_COMMAND,
  KEY_TAB_COMMAND,
} from 'lexical';
import type { EditorThemeClasses, LexicalNode, TextNode } from 'lexical';
import { useEffect, useRef, useState } from 'react';
import type { FC, JSX, RefObject } from 'react';

import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';

import { $createComposerCommandNode, $isComposerCommandNode, ComposerCommandNode } from './ComposerCommandNode.tsx';
import type { ComposerSegment } from './composerCommandTokens.ts';
import { isWhitespace, mergeAdjacentTextSegments, splitComposerCommandSegments } from './composerCommandTokens.ts';
import {
  $createComposerMarkdownLinkNode,
  $isComposerMarkdownLinkNode,
  ComposerMarkdownLinkNode,
} from './ComposerMarkdownLinkNode.tsx';

const $isComposerChipNode = (
  node: LexicalNode | null | undefined,
): node is ComposerCommandNode | ComposerMarkdownLinkNode =>
  $isComposerCommandNode(node) || $isComposerMarkdownLinkNode(node);

const isOnlyWhitespace = (text: string): boolean => {
  for (let i = 0; i < text.length; i += 1) {
    if (!isWhitespace(text[i])) {
      return false;
    }
  }
  return text.length > 0;
};

const $removeChipAndPad = (chip: LexicalNode, pad: TextNode, padStart: number, padEnd: number): void => {
  if (padStart === 0 && padEnd === pad.getTextContentSize()) {
    pad.remove();
  } else {
    pad.spliceText(padStart, padEnd - padStart, '');
  }
  chip.remove();
};

/** Backspace/Delete against a chip (or its trailing/leading pad space) removes the whole chip. */
const $deleteAdjacentComposerChip = (isBackward: boolean): boolean => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const { anchor } = selection;
  const anchorNode = anchor.getNode();

  if ($isComposerChipNode(anchorNode)) {
    anchorNode.remove();
    return true;
  }

  if (!$isTextNode(anchorNode)) {
    return false;
  }

  const text = anchorNode.getTextContent();
  const { offset } = anchor;

  if (isBackward) {
    if (offset === 0) {
      const prev = anchorNode.getPreviousSibling();
      if ($isComposerChipNode(prev)) {
        prev.remove();
        return true;
      }
      return false;
    }

    // Cursor after whitespace pad that follows a chip (menu insert adds ` `).
    const before = text.slice(0, offset);
    const prev = anchorNode.getPreviousSibling();
    if (isOnlyWhitespace(before) && $isComposerChipNode(prev)) {
      $removeChipAndPad(prev, anchorNode, 0, offset);
      return true;
    }
    return false;
  }

  if (offset === text.length) {
    const next = anchorNode.getNextSibling();
    if ($isComposerChipNode(next)) {
      next.remove();
      return true;
    }
    return false;
  }

  const after = text.slice(offset);
  const next = anchorNode.getNextSibling();
  if (isOnlyWhitespace(after) && $isComposerChipNode(next)) {
    $removeChipAndPad(next, anchorNode, offset, text.length);
    return true;
  }

  return false;
};

export type ComposerPromptChange = {
  readonly adjacentToToken: boolean;
  readonly cursor: number;
  readonly text: string;
};

export type ComposerCommandMenuKeyHandlers = {
  readonly onArrowDown: () => void;
  readonly onArrowUp: () => void;
  readonly onDismiss: () => void;
  readonly onSelect: () => void;
  readonly onSpaceDismiss: () => void;
  readonly open: boolean;
};

export type ComposerPromptEditorProps = {
  readonly availableCommands?: readonly AvailableCommand[];
  readonly commandMenu?: ComposerCommandMenuKeyHandlers;
  readonly disabled: boolean;
  /** Parent assigns `() => void` that focuses the editor with the caret at root end. */
  readonly focusEndRef?: RefObject<(() => void) | null>;
  readonly onChange: (next: ComposerPromptChange) => void;
  readonly onSubmit: () => void;
  readonly placeholder: string;
  /** When set, applied after an external `value` sync, then cleared by the editor. */
  readonly syncCursorRef?: RefObject<null | number>;
  readonly value: string;
};

const lexicalTheme: EditorThemeClasses = {
  paragraph: 'composer-prompt-editor__paragraph',
};

const onError = (error: Error): void => {
  console.error(error);
};

const $appendTextWithBreaks = (parent: LexicalNode & { append: (...nodes: LexicalNode[]) => void }, text: string) => {
  const parts = text.split('\n');
  parts.forEach((part, index) => {
    if (part.length > 0) {
      parent.append($createTextNode(part));
    }
    if (index < parts.length - 1) {
      parent.append($createLineBreakNode());
    }
  });
};

const $readEditorSegments = (): readonly ComposerSegment[] => {
  const segments: ComposerSegment[] = [];
  const visit = (node: LexicalNode): void => {
    if ($isComposerCommandNode(node)) {
      segments.push({ kind: 'command', value: node.getInvocation() });
      return;
    }
    if ($isComposerMarkdownLinkNode(node)) {
      segments.push({ href: node.getHref(), kind: 'markdownLink', label: node.getLabel() });
      return;
    }
    if ($isTextNode(node)) {
      segments.push({ kind: 'text', value: node.getTextContent() });
      return;
    }
    if (node.getType() === 'linebreak') {
      segments.push({ kind: 'text', value: '\n' });
      return;
    }
    const element = node as LexicalNode & { getChildren?: () => LexicalNode[] };
    if (typeof element.getChildren === 'function') {
      for (const child of element.getChildren()) {
        visit(child);
      }
    }
  };
  visit($getRoot());
  return mergeAdjacentTextSegments(segments);
};

const segmentsEqual = (left: readonly ComposerSegment[], right: readonly ComposerSegment[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const segment = left[index];
    const other = right[index];
    if (segment.kind !== other.kind) {
      return false;
    }
    if (segment.kind === 'text' || segment.kind === 'command') {
      if (other.kind !== segment.kind || segment.value !== other.value) {
        return false;
      }
    } else if (other.kind !== 'markdownLink' || segment.label !== other.label || segment.href !== other.href) {
      return false;
    }
  }
  return true;
};

const $setComposerContent = (text: string, availableCommands: readonly AvailableCommand[]): void => {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  const segments = splitComposerCommandSegments(text, availableCommands);
  if (segments.length === 0) {
    root.append(paragraph);
    return;
  }
  for (const segment of segments) {
    if (segment.kind === 'command') {
      paragraph.append($createComposerCommandNode(segment.value));
    } else if (segment.kind === 'markdownLink') {
      paragraph.append($createComposerMarkdownLinkNode(segment.label, segment.href));
    } else {
      $appendTextWithBreaks(paragraph, segment.value);
    }
  }
  root.append(paragraph);
};

const $getLogicalCursorAndAdjacency = (): { adjacentToToken: boolean; cursor: number } => {
  const selection = $getSelection();
  const root = $getRoot();
  if (!$isRangeSelection(selection)) {
    return { adjacentToToken: false, cursor: root.getTextContentSize() };
  }

  const { anchor } = selection;
  const anchorNode = anchor.getNode();

  type WalkResult = { readonly adjacentToToken: boolean; readonly cursor: number };

  const visit = (node: LexicalNode, cursorBefore: number): null | WalkResult => {
    if ($isComposerChipNode(node)) {
      const size = node.getTextContentSize();
      if (node.getKey() === anchorNode.getKey()) {
        return {
          adjacentToToken: true,
          cursor: cursorBefore + Math.min(anchor.offset, size),
        };
      }
      return null;
    }
    if ($isTextNode(node)) {
      const size = node.getTextContentSize();
      if (node.getKey() === anchorNode.getKey()) {
        const prev = node.getPreviousSibling();
        const next = node.getNextSibling();
        return {
          adjacentToToken:
            (anchor.offset === 0 && $isComposerChipNode(prev)) || (anchor.offset === size && $isComposerChipNode(next)),
          cursor: cursorBefore + Math.min(anchor.offset, size),
        };
      }
      return null;
    }
    if (node.getType() === 'linebreak') {
      if (node.getKey() === anchorNode.getKey()) {
        return { adjacentToToken: false, cursor: cursorBefore };
      }
      return null;
    }
    const element = node as LexicalNode & { getChildren?: () => LexicalNode[] };
    if (typeof element.getChildren !== 'function') {
      return null;
    }
    const children = element.getChildren();
    if (node.getKey() === anchorNode.getKey()) {
      const childIndex = Math.min(anchor.offset, children.length);
      let cursor = cursorBefore;
      for (let i = 0; i < childIndex; i += 1) {
        cursor += children[i].getTextContentSize();
      }
      const atChild = children[childIndex];
      const beforeChild = childIndex > 0 ? children[childIndex - 1] : undefined;
      return {
        adjacentToToken: $isComposerChipNode(atChild) || $isComposerChipNode(beforeChild),
        cursor,
      };
    }
    let cursor = cursorBefore;
    for (const child of children) {
      const hit = visit(child, cursor);
      if (hit !== null) {
        return hit;
      }
      cursor += child.getTextContentSize();
    }
    return null;
  };

  const hit = visit(root, 0);
  if (hit === null) {
    return { adjacentToToken: false, cursor: root.getTextContentSize() };
  }
  return hit;
};

const $setLogicalCursor = (offset: number): void => {
  const root = $getRoot();
  const target = Math.max(0, Math.min(offset, root.getTextContentSize()));
  let remaining = target;

  const visit = (node: LexicalNode): boolean => {
    if ($isComposerChipNode(node)) {
      const size = node.getTextContentSize();
      if (remaining <= size) {
        if (remaining === 0) {
          node.selectStart();
        } else {
          node.selectEnd();
        }
        return true;
      }
      remaining -= size;
      return false;
    }
    if ($isTextNode(node)) {
      const size = node.getTextContentSize();
      if (remaining <= size) {
        node.select(remaining, remaining);
        return true;
      }
      remaining -= size;
      return false;
    }
    if (node.getType() === 'linebreak') {
      if (remaining === 0) {
        node.selectNext(0, 0);
        return true;
      }
      remaining -= 1;
      return false;
    }
    const element = node as LexicalNode & { getChildren?: () => LexicalNode[] };
    if (typeof element.getChildren === 'function') {
      for (const child of element.getChildren()) {
        if (visit(child)) {
          return true;
        }
      }
    }
    return false;
  };

  if (!visit(root)) {
    root.selectEnd();
  }
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

const FocusEndApiPlugin: FC<{ readonly focusEndRef: RefObject<(() => void) | null> }> = ({ focusEndRef }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    focusEndRef.current = () => {
      editor.focus(undefined, { defaultSelection: 'rootEnd' });
    };
    return () => {
      focusEndRef.current = null;
    };
  }, [editor, focusEndRef]);

  return null;
};

const ExternalValuePlugin: FC<{
  readonly availableCommands: readonly AvailableCommand[];
  readonly lastEmittedRef: RefObject<string>;
  readonly syncCursorRef?: RefObject<null | number>;
  readonly value: string;
}> = ({ availableCommands, lastEmittedRef, syncCursorRef, value }) => {
  const [editor] = useLexicalComposerContext();
  const commandsKey = availableCommands.map(command => command.name).join('\0');
  const prevCommandsKeyRef = useRef(commandsKey);

  useEffect(() => {
    const commandsChanged = prevCommandsKeyRef.current !== commandsKey;
    prevCommandsKeyRef.current = commandsKey;

    if (value === lastEmittedRef.current && !commandsChanged) {
      return;
    }

    editor.update(
      () => {
        if ($getRoot().getTextContent() === value && !commandsChanged) {
          lastEmittedRef.current = value;
          return;
        }
        $setComposerContent(value, availableCommands);
        lastEmittedRef.current = value;
        const syncCursor = syncCursorRef?.current ?? null;
        if (syncCursor !== null && syncCursorRef !== undefined) {
          $setLogicalCursor(syncCursor);
          syncCursorRef.current = null;
        }
      },
      { tag: 'external-sync' },
    );
  }, [availableCommands, commandsKey, editor, lastEmittedRef, syncCursorRef, value]);

  return null;
};

const SubmitOnEnterPlugin: FC<{ readonly menuOpen: boolean; readonly onSubmit: () => void }> = ({
  menuOpen,
  onSubmit,
}) => {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        event => {
          if (menuOpen) {
            return false;
          }
          if (event === null || event.shiftKey) {
            return false;
          }
          event.preventDefault();
          onSubmit();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, menuOpen, onSubmit],
  );

  return null;
};

const ChipifyPlugin: FC<{ readonly availableCommands: readonly AvailableCommand[] }> = ({ availableCommands }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState, tags }) => {
        if (tags.has('chipify') || tags.has('external-sync')) {
          return;
        }
        editorState.read(() => {
          const text = $getRoot().getTextContent();
          const desired = splitComposerCommandSegments(text, availableCommands);
          if (segmentsEqual(desired, $readEditorSegments())) {
            return;
          }
          const { cursor } = $getLogicalCursorAndAdjacency();
          editor.update(
            () => {
              $setComposerContent(text, availableCommands);
              $setLogicalCursor(cursor);
            },
            { tag: 'chipify' },
          );
        });
      }),
    [availableCommands, editor],
  );

  return null;
};

const ChipDeletePlugin: FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        isBackward => {
          const handled = $deleteAdjacentComposerChip(isBackward);
          return handled;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  );

  return null;
};

const ComposerCommandKeyPlugin: FC<{ readonly commandMenu?: ComposerCommandMenuKeyHandlers }> = ({ commandMenu }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (commandMenu === undefined) {
      return;
    }

    const { open } = commandMenu;
    const unregister = [
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        event => {
          if (!open) {
            return false;
          }
          event.preventDefault();
          commandMenu.onArrowUp();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        event => {
          if (!open) {
            return false;
          }
          event.preventDefault();
          commandMenu.onArrowDown();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        event => {
          if (!open) {
            return false;
          }
          event?.preventDefault();
          commandMenu.onSelect();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        event => {
          if (!open) {
            return false;
          }
          event.preventDefault();
          commandMenu.onSelect();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        event => {
          if (!open) {
            return false;
          }
          event.preventDefault();
          commandMenu.onDismiss();
          return true;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(
        KEY_SPACE_COMMAND,
        () => {
          if (!open) {
            return false;
          }
          commandMenu.onSpaceDismiss();
          return false;
        },
        COMMAND_PRIORITY_CRITICAL,
      ),
    ];

    return () => {
      for (const dispose of unregister) {
        dispose();
      }
    };
  }, [commandMenu, editor]);

  return null;
};

export const ComposerPromptEditor: FC<ComposerPromptEditorProps> = ({
  availableCommands = [],
  commandMenu,
  disabled,
  focusEndRef,
  onChange,
  onSubmit,
  placeholder,
  syncCursorRef,
  value,
}) => {
  const lastEmittedRef = useRef(value);

  // Stable once: LexicalExtensionComposer recreates the editor if `extension` identity changes.
  // eslint-disable-next-line react/hook-use-state -- setter unused; extension identity must stay fixed
  const [extension] = useState(() =>
    defineExtension({
      $initialEditorState: () => {
        $setComposerContent(value, availableCommands);
      },
      // EditablePlugin owns editable; starts true, flips on mount if needed.
      editable: true,
      name: 'ComposerPromptEditor',
      namespace: 'ComposerPromptEditor',
      nodes: [ComposerCommandNode, ComposerMarkdownLinkNode],
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
      <ChipDeletePlugin />
      <SubmitOnEnterPlugin menuOpen={commandMenu?.open === true} onSubmit={onSubmit} />
      <ComposerCommandKeyPlugin commandMenu={commandMenu} />
    </LexicalExtensionComposer>
  );
};
