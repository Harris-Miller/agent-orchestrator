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
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  defineExtension,
  DELETE_CHARACTER_COMMAND,
  FOCUS_COMMAND,
  HISTORY_MERGE_TAG,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
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
import { isWhitespace } from './composerCommandTokens.ts';
import {
  $createComposerMarkdownLinkNode,
  $isComposerMarkdownLinkNode,
  ComposerMarkdownLinkNode,
} from './ComposerMarkdownLinkNode.tsx';
import {
  $createComposerMarkdownTextNode,
  $readComposerTextStyle,
  ComposerMarkdownTextNode,
} from './ComposerMarkdownTextNode.ts';
import { buildComposerPieces, composerPiecesEqual } from './composerPieces.ts';
import type { ComposerPiece } from './composerPieces.ts';

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

const $readEditorPieces = (): readonly ComposerPiece[] => {
  const pieces: ComposerPiece[] = [];
  const visit = (node: LexicalNode): void => {
    if ($isComposerCommandNode(node)) {
      pieces.push({ kind: 'command', value: node.getInvocation() });
      return;
    }
    if ($isComposerMarkdownLinkNode(node)) {
      pieces.push({ href: node.getHref(), kind: 'markdownLink', label: node.getLabel() });
      return;
    }
    if ($isTextNode(node)) {
      pieces.push({ kind: 'text', style: $readComposerTextStyle(node), value: node.getTextContent() });
      return;
    }
    if (node.getType() === 'linebreak') {
      pieces.push({ kind: 'linebreak' });
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
  return pieces;
};

const $setComposerContent = (text: string, availableCommands: readonly AvailableCommand[]): void => {
  const root = $getRoot();
  root.clear();
  const paragraph = $createParagraphNode();
  for (const piece of buildComposerPieces(text, availableCommands)) {
    switch (piece.kind) {
      case 'command': {
        paragraph.append($createComposerCommandNode(piece.value));
        break;
      }
      case 'linebreak': {
        paragraph.append($createLineBreakNode());
        break;
      }
      case 'markdownLink': {
        paragraph.append($createComposerMarkdownLinkNode(piece.label, piece.href));
        break;
      }
      case 'text': {
        paragraph.append($createComposerMarkdownTextNode(piece.value, piece.style));
        break;
      }
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

/** Runs below the command menu's CRITICAL Esc handler, so an open menu dismisses first. */
const EscapePlugin: FC<{ readonly onEscape: () => void }> = ({ onEscape }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        event => {
          event.preventDefault();
          onEscape();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, onEscape],
  );

  return null;
};

/** Re-derives chips and Markdown styling from the draft text whenever an edit leaves the nodes out of step with it. */
const ChipifyPlugin: FC<{ readonly availableCommands: readonly AvailableCommand[] }> = ({ availableCommands }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState, tags }) => {
        // Rebuilding mid-composition would cancel an IME / dead-key sequence.
        if (tags.has('chipify') || tags.has('external-sync') || editor.isComposing()) {
          return;
        }
        editorState.read(() => {
          const text = $getRoot().getTextContent();
          if (composerPiecesEqual(buildComposerPieces(text, availableCommands), $readEditorPieces())) {
            return;
          }
          const { cursor } = $getLogicalCursorAndAdjacency();
          editor.update(
            () => {
              $setComposerContent(text, availableCommands);
              $setLogicalCursor(cursor);
            },
            // History-merge keeps the rebuild in the same undo step as the keystroke that caused it.
            { tag: ['chipify', HISTORY_MERGE_TAG] },
          );
        });
      }),
    [availableCommands, editor],
  );

  return null;
};

/** Span ids (see `ComposerTextStyle.span`) whose opening-to-closing marker range holds the selection's anchor or focus. */
const $activeMarkerSpans = (): ReadonlySet<string> => {
  const active = new Set<string>();
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return active;
  }
  const nodes = $getRoot().getAllTextNodes();
  const keys = nodes.map(node => node.getKey());
  const ends = [selection.anchor.getNode().getKey(), selection.focus.getNode().getKey()].map(key => keys.indexOf(key));
  const opened = new Map<string, number>();
  nodes.forEach((node, index) => {
    const { span } = $readComposerTextStyle(node);
    if (span === '') {
      return;
    }
    const openedAt = opened.get(span);
    if (openedAt === undefined) {
      opened.set(span, index);
    } else if (ends.some(end => end >= openedAt && end <= index)) {
      active.add(span);
    }
  });
  return active;
};

/** Marker reveal: inline markers show only while the caret is inside their span and the editor is focused. */
const MarkerRevealPlugin: FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const reveal = (): void => {
      const root = editor.getRootElement();
      if (root === null) {
        return;
      }
      const focused = root.ownerDocument.activeElement === root;
      const active = focused ? editor.getEditorState().read($activeMarkerSpans) : new Set<string>();
      for (const marker of root.querySelectorAll<HTMLElement>('[data-md-span]')) {
        marker.toggleAttribute('data-md-active', active.has(marker.dataset.mdSpan ?? ''));
      }
    };
    const onFocusChange = (): boolean => {
      reveal();
      return false;
    };
    reveal();
    const unregister = [
      editor.registerUpdateListener(reveal),
      editor.registerCommand(FOCUS_COMMAND, onFocusChange, COMMAND_PRIORITY_LOW),
      editor.registerCommand(BLUR_COMMAND, onFocusChange, COMMAND_PRIORITY_LOW),
    ];
    return () => {
      for (const dispose of unregister) {
        dispose();
      }
    };
  }, [editor]);

  return null;
};

/** A `#`, `>`, or bullet marker, which Markdown styling never shows (ordered numbers do show). */
const $isHiddenBlockMarker = (node: LexicalNode | null | undefined): node is TextNode => {
  if (!$isTextNode(node)) {
    return false;
  }
  const { block, role } = $readComposerTextStyle(node);
  return role === 'blockMarker' && block !== 'ordered';
};

/** The hidden block marker a collapsed caret sits right after (the visible start of its line's content), if any. */
const $hiddenMarkerBeforeCaret = (): TextNode | null => {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== 'text') {
    return null;
  }
  const node = selection.anchor.getNode();
  if ($isHiddenBlockMarker(node) && selection.anchor.offset === node.getTextContentSize()) {
    return node;
  }
  const prev = node.getPreviousSibling();
  return selection.anchor.offset === 0 && $isHiddenBlockMarker(prev) ? prev : null;
};

/**
 * Hidden block markers are invisible, so keep the caret out of them: it snaps to the start of the line's content,
 * ArrowLeft there goes to the end of the previous line, and Backspace there removes the marker.
 */
const BlockMarkerCaretPlugin: FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const unregister = [
      editor.registerUpdateListener(({ editorState }) => {
        const inside = editorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed() || selection.anchor.type !== 'text') {
            return null;
          }
          const node = selection.anchor.getNode();
          return $isHiddenBlockMarker(node) && selection.anchor.offset < node.getTextContentSize()
            ? node.getKey()
            : null;
        });
        if (inside !== null) {
          editor.update(
            () => {
              const node = $getRoot()
                .getAllTextNodes()
                .find(candidate => candidate.getKey() === inside);
              node?.select(node.getTextContentSize(), node.getTextContentSize());
            },
            { tag: ['md-caret', HISTORY_MERGE_TAG] },
          );
        }
      }),
      editor.registerCommand(
        KEY_ARROW_LEFT_COMMAND,
        event => {
          const marker = event.shiftKey ? null : $hiddenMarkerBeforeCaret();
          if (marker === null) {
            return false;
          }
          event.preventDefault();
          marker.getPreviousSibling()?.selectPrevious();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        isBackward => {
          const marker = isBackward ? $hiddenMarkerBeforeCaret() : null;
          if (marker === null) {
            return false;
          }
          marker.selectNext(0, 0);
          marker.remove();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    ];
    return () => {
      for (const dispose of unregister) {
        dispose();
      }
    };
  }, [editor]);

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
      nodes: [ComposerCommandNode, ComposerMarkdownLinkNode, ComposerMarkdownTextNode],
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
            height: 18,
            mr: 1,
            verticalAlign: 'text-bottom',
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
      <ChipDeletePlugin />
      {onEscape === undefined ? null : <EscapePlugin onEscape={onEscape} />}
      <SubmitOnEnterPlugin menuOpen={commandMenu?.open === true} onSubmit={onSubmit} />
      <ComposerCommandKeyPlugin commandMenu={commandMenu} />
    </LexicalExtensionComposer>
  );
};
