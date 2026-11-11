// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { ThemeProvider } from '@mui/material/styles';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  DELETE_CHARACTER_COMMAND,
  HISTORY_PUSH_TAG,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  UNDO_COMMAND,
} from 'lexical';
import type { LexicalEditor } from 'lexical';
import { afterEach } from 'vitest';

import { mockHostLayer } from '../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../createHostRuntime.ts';
import { bindHostRuntime } from '../../hostRuntime.ts';
import type { AvailableCommand } from '../../host/sessionUpdateReducer.ts';
import { theme } from '../../theme/themes.ts';

import type { ComposerPromptChange } from './ComposerPromptEditor.tsx';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { ComposerPromptEditor } = await import('./ComposerPromptEditor.tsx');

afterEach(cleanup);

const statusCommand: readonly AvailableCommand[] = [{ description: 'Show status', name: 'status' }];

const mount = (
  value: string,
  options: {
    readonly availableCommands?: readonly AvailableCommand[];
    readonly onChange?: (next: ComposerPromptChange) => void;
  } = {},
) => {
  const props = {
    availableCommands: options.availableCommands,
    disabled: false,
    onChange: options.onChange ?? (() => undefined),
    onSubmit: () => undefined,
    placeholder: 'Message',
  };
  const tree = (next: string) => (
    <ThemeProvider theme={theme}>
      <ComposerPromptEditor {...props} value={next} />
    </ThemeProvider>
  );
  const view = render(tree(value));
  return {
    rerender: (next: string) => {
      view.rerender(tree(next));
    },
  };
};

/** Retries `check` until it stops throwing (Lexical commits and listeners run asynchronously). */
const eventually = (check: () => void) => Effect.promise(() => waitFor(check));

const editable = (): HTMLElement => screen.getByTestId('composer-editor');

const lexicalEditor = (): LexicalEditor => {
  const { __lexicalEditor: editor } = editable() as HTMLElement & { __lexicalEditor?: LexicalEditor };
  if (editor === undefined) {
    throw new Error('Lexical editor not attached to the content-editable');
  }
  return editor;
};

/** Replaces the draft with one plain text node, as a user edit would, and puts the caret at its end. */
const typeInto = (value: string, tag?: typeof HISTORY_PUSH_TAG): void => {
  lexicalEditor().update(
    () => {
      const text = $createTextNode(value);
      $getRoot().clear().append($createParagraphNode().append(text));
      text.select(value.length, value.length);
    },
    tag === undefined ? undefined : { tag },
  );
};

const selectTextNode = (index: number, offset = 0): void => {
  lexicalEditor().update(() => {
    const node = $getRoot().getAllTextNodes().at(index);
    if (node === undefined) {
      throw new Error(`No text node at index ${index}`);
    }
    node.select(offset, offset);
  });
};

const markers = (): readonly string[] =>
  [...editable().querySelectorAll('[data-md-role="marker"]')].map(element => element.textContent ?? '');

describe('ComposerPromptEditor Markdown styling', () => {
  it.effect('styles inline Markdown in the draft without changing its text', () =>
    Effect.gen(function* () {
      mount('**bold** and `code`');
      yield* eventually(() => {
        assert.strictEqual(editable().querySelector('strong')?.textContent, 'bold');
      });
      assert.strictEqual(editable().querySelector('code')?.textContent, 'code');
      assert.strictEqual(editable().textContent, '**bold** and `code`');
      assert.deepStrictEqual(markers(), ['**', '**', '`', '`']);
    }),
  );

  it.effect('marks block-level lines', () =>
    Effect.gen(function* () {
      mount('# Title\n> quote\n- item\n```\n**raw**\n```');
      yield* eventually(() => {
        assert.isNotNull(editable().querySelector('[data-md-block="h1"]'));
      });
      assert.isNotNull(editable().querySelector('[data-md-block="quote"]'));
      assert.isNotNull(editable().querySelector('[data-md-block="bullet"]'));
      assert.isNotNull(editable().querySelector('[data-md-block="codeBlock"]'));
      assert.isNull(editable().querySelector('strong'));
    }),
  );

  it.effect('restyles when the draft text is replaced from outside', () =>
    Effect.gen(function* () {
      const view = mount('plain');
      assert.isNull(editable().querySelector('strong'));
      view.rerender('now **bold**');
      yield* eventually(() => {
        assert.strictEqual(editable().querySelector('strong')?.textContent, 'bold');
      });
      assert.strictEqual(editable().textContent, 'now **bold**');
    }),
  );

  it.effect('restyles after an edit and reports the unchanged text', () =>
    Effect.gen(function* () {
      let last: ComposerPromptChange | undefined;
      mount('', {
        onChange: next => {
          last = next;
        },
      });
      typeInto('typed **bold**');
      yield* eventually(() => {
        assert.strictEqual(editable().querySelector('strong')?.textContent, 'bold');
      });
      assert.strictEqual(editable().textContent, 'typed **bold**');
      assert.strictEqual(last?.text, 'typed **bold**');
    }),
  );

  it.effect('keeps the caret at the same draft offset when an edit restyles the draft', () =>
    Effect.gen(function* () {
      let last: ComposerPromptChange | undefined;
      mount('', {
        onChange: next => {
          last = next;
        },
      });
      lexicalEditor().update(() => {
        const text = $createTextNode('a **b** c');
        $getRoot().clear().append($createParagraphNode().append(text));
        text.select(5, 5);
      });
      yield* eventually(() => {
        assert.strictEqual(editable().querySelector('strong')?.textContent, 'b');
      });
      assert.deepStrictEqual({ cursor: last?.cursor, text: last?.text }, { cursor: 5, text: 'a **b** c' });
    }),
  );

  it.effect('keeps Command Chips alongside styled text', () =>
    Effect.gen(function* () {
      mount('/status **now**', { availableCommands: statusCommand });
      yield* eventually(() => {
        assert.strictEqual(editable().querySelector('strong')?.textContent, 'now');
      });
      assert.isNotNull(editable().querySelector('[data-testid="composer-command-chip"]'));
      assert.strictEqual(editable().textContent?.endsWith('**now**'), true);
    }),
  );

  it.effect('reports the caret as adjacent to a chip once an edit has been chipified', () =>
    Effect.gen(function* () {
      let last: ComposerPromptChange | undefined;
      mount('', {
        availableCommands: statusCommand,
        onChange: next => {
          last = next;
        },
      });
      typeInto('/status');
      yield* eventually(() => {
        assert.isNotNull(editable().querySelector('[data-testid="composer-command-chip"]'));
      });
      // The Composer Menu closes on this: a caret next to a chip is not a Composer Trigger.
      yield* eventually(() => {
        assert.isTrue(last?.adjacentToToken);
      });
    }),
  );
});

describe('ComposerPromptEditor paste and undo', () => {
  it.effect('styles Markdown pasted as plain text without changing it', () =>
    Effect.gen(function* () {
      let last: ComposerPromptChange | undefined;
      mount('', {
        onChange: next => {
          last = next;
        },
      });
      editable().focus();
      lexicalEditor().update(() => {
        $getRoot().selectEnd();
      });
      const clipboardData = {
        files: [],
        getData: (type: string) => (type === 'text/plain' ? '**p**\n> q' : ''),
        types: ['text/plain'],
      };
      // Lexical only reads a real ClipboardEvent, and happy-dom does not populate its clipboardData.
      const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData });
      lexicalEditor().dispatchCommand(PASTE_COMMAND, pasteEvent);
      yield* eventually(() => {
        assert.strictEqual(editable().querySelector('strong')?.textContent, 'p');
      });
      assert.isNotNull(editable().querySelector('[data-md-role="blockMarker"][data-md-block="quote"]'));
      assert.strictEqual(last?.text, '**p**\n> q');
    }),
  );

  it.effect('undoes an edit and its restyling in one step', () =>
    Effect.gen(function* () {
      let last: ComposerPromptChange | undefined;
      mount('', {
        onChange: next => {
          last = next;
        },
      });
      // The first edit only seeds the history stack; the second, pushed as its own entry, is the one undone.
      typeInto('a');
      yield* eventually(() => {
        assert.strictEqual(last?.text, 'a');
      });
      typeInto('a **b**', HISTORY_PUSH_TAG);
      yield* eventually(() => {
        assert.strictEqual(editable().querySelector('strong')?.textContent, 'b');
      });
      lexicalEditor().dispatchCommand(UNDO_COMMAND, undefined);
      yield* eventually(() => {
        assert.strictEqual(last?.text, 'a');
      });
      assert.strictEqual(editable().textContent, 'a');
    }),
  );
});

describe('ComposerPromptEditor Marker reveal', () => {
  const activeMarkers = (): readonly string[] =>
    [...editable().querySelectorAll('[data-md-span][data-md-active]')].map(
      element => `${element.getAttribute('data-md-span')}:${element.textContent}`,
    );

  it.effect('shows inline markers only while the caret is inside their span, and none when unfocused', () =>
    Effect.gen(function* () {
      mount('**a** and _b_ c');
      yield* eventually(() => {
        assert.strictEqual(markers().length, 4);
      });
      assert.deepStrictEqual(activeMarkers(), []);

      editable().focus();
      // Text nodes: `**`, `a`, `**`, ` and `, `_`, `b`, `_`, ` c`.
      selectTextNode(1);
      yield* eventually(() => {
        assert.deepStrictEqual(activeMarkers(), ['0:0:**', '0:0:**']);
      });
      selectTextNode(5);
      yield* eventually(() => {
        assert.deepStrictEqual(activeMarkers(), ['0:1:_', '0:1:_']);
      });
      selectTextNode(3, 2);
      yield* eventually(() => {
        assert.deepStrictEqual(activeMarkers(), []);
      });

      selectTextNode(1);
      yield* eventually(() => {
        assert.strictEqual(activeMarkers().length, 2);
      });
      editable().blur();
      yield* eventually(() => {
        assert.deepStrictEqual(activeMarkers(), []);
      });
    }),
  );
});

describe('ComposerPromptEditor hidden block markers', () => {
  const caret = (): { readonly offset: number; readonly text: string } | undefined =>
    lexicalEditor()
      .getEditorState()
      .read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection)
          ? { offset: selection.anchor.offset, text: selection.anchor.getNode().getTextContent() }
          : undefined;
      });

  it.effect('never marks block markers for reveal', () =>
    Effect.gen(function* () {
      mount('# h\n> q\n- i');
      yield* eventually(() => {
        assert.strictEqual(editable().querySelectorAll('[data-md-role="blockMarker"]').length, 3);
      });
      assert.strictEqual(editable().querySelectorAll('[data-md-span]').length, 0);
    }),
  );

  it.effect('keeps the caret out of a hidden marker', () =>
    Effect.gen(function* () {
      mount('> q');
      yield* eventually(() => {
        assert.isNotNull(editable().querySelector('[data-md-role="blockMarker"]'));
      });
      editable().focus();
      selectTextNode(0);
      yield* eventually(() => {
        assert.deepStrictEqual(caret(), { offset: 2, text: '> ' });
      });
    }),
  );

  it.effect('removes the marker on Backspace at the start of the line content', () =>
    Effect.gen(function* () {
      let last: ComposerPromptChange | undefined;
      mount('> q\nplain', {
        onChange: next => {
          last = next;
        },
      });
      yield* eventually(() => {
        assert.isNotNull(editable().querySelector('[data-md-role="blockMarker"]'));
      });
      editable().focus();
      selectTextNode(1);
      lexicalEditor().dispatchCommand(DELETE_CHARACTER_COMMAND, true);
      yield* eventually(() => {
        assert.strictEqual(last?.text, 'q\nplain');
      });
      assert.isNull(editable().querySelector('[data-md-role="blockMarker"]'));
    }),
  );

  it.effect('moves ArrowLeft at the start of the line content to the end of the previous line', () =>
    Effect.gen(function* () {
      mount('a\n> q');
      yield* eventually(() => {
        assert.isNotNull(editable().querySelector('[data-md-role="blockMarker"]'));
      });
      editable().focus();
      // Text nodes: `a`, `> `, `q`.
      selectTextNode(2);
      lexicalEditor().dispatchCommand(KEY_ARROW_LEFT_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
      yield* eventually(() => {
        assert.deepStrictEqual(caret(), { offset: 1, text: 'a' });
      });
    }),
  );

  it.effect('continues a quote on Shift+Enter and leaves it on an empty quote line', () =>
    Effect.gen(function* () {
      let last: ComposerPromptChange | undefined;
      mount('> q', {
        onChange: next => {
          last = next;
        },
      });
      yield* eventually(() => {
        assert.isNotNull(editable().querySelector('[data-md-role="blockMarker"]'));
      });
      editable().focus();
      // Text nodes: `> `, `q`.
      selectTextNode(1, 1);
      const shiftEnter = () =>
        lexicalEditor().dispatchCommand(
          KEY_ENTER_COMMAND,
          new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }),
        );
      shiftEnter();
      yield* eventually(() => {
        assert.strictEqual(last?.text, '> q\n> ');
        assert.strictEqual(
          editable().querySelectorAll('[data-md-block="quote"][data-md-role="blockMarker"]').length,
          2,
        );
      });
      shiftEnter();
      yield* eventually(() => {
        assert.strictEqual(last?.text, '> q\n');
      });
    }),
  );
});
