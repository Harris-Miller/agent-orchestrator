// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import type { LexicalEditor } from 'lexical';
import { afterEach } from 'vitest';

import { mockHostLayer } from '../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../createHostRuntime.ts';
import { bindHostRuntime } from '../../hostRuntime.ts';

import type { ComposerPromptChange } from './ComposerPromptEditor.tsx';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { ComposerPromptEditor } = await import('./ComposerPromptEditor.tsx');

afterEach(cleanup);

const mount = (value: string, onChange: (next: ComposerPromptChange) => void = () => undefined) => {
  const props = { disabled: false, onChange, onSubmit: () => undefined, placeholder: 'Message' };
  const view = render(<ComposerPromptEditor {...props} value={value} />);
  return {
    rerender: (next: string) => {
      view.rerender(<ComposerPromptEditor {...props} value={next} />);
    },
  };
};

const editable = (): HTMLElement => screen.getByTestId('composer-editor');

const lexicalEditor = (): LexicalEditor => {
  const { __lexicalEditor: editor } = editable() as HTMLElement & { __lexicalEditor?: LexicalEditor };
  if (editor === undefined) {
    throw new Error('Lexical editor not attached to the content-editable');
  }
  return editor;
};

const markers = (): readonly string[] =>
  [...editable().querySelectorAll('[data-md-role="marker"]')].map(element => element.textContent ?? '');

describe('ComposerPromptEditor Markdown styling', () => {
  it('styles inline Markdown in the draft without changing its text', async () => {
    mount('**bold** and `code`');
    await waitFor(() => {
      assert.strictEqual(editable().querySelector('strong')?.textContent, 'bold');
    });
    assert.strictEqual(editable().querySelector('code')?.textContent, 'code');
    assert.strictEqual(editable().textContent, '**bold** and `code`');
    assert.deepStrictEqual(markers(), ['**', '**', '`', '`']);
  });

  it('marks block-level lines', async () => {
    mount('# Title\n> quote\n- item\n```\n**raw**\n```');
    await waitFor(() => {
      assert.isNotNull(editable().querySelector('[data-md-block="h1"]'));
    });
    assert.isNotNull(editable().querySelector('[data-md-block="quote"]'));
    assert.isNotNull(editable().querySelector('[data-md-block="bullet"]'));
    assert.isNotNull(editable().querySelector('[data-md-block="codeBlock"]'));
    assert.isNull(editable().querySelector('strong'));
  });

  it('restyles when the draft text is replaced from outside', async () => {
    const view = mount('plain');
    assert.isNull(editable().querySelector('strong'));
    view.rerender('now **bold**');
    await waitFor(() => {
      assert.strictEqual(editable().querySelector('strong')?.textContent, 'bold');
    });
    assert.strictEqual(editable().textContent, 'now **bold**');
  });

  it('restyles after an edit and reports the unchanged text', async () => {
    let last: ComposerPromptChange | undefined;
    mount('', next => {
      last = next;
    });
    lexicalEditor().update(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode('typed **bold**'));
      $getRoot().clear().append(paragraph);
    });
    await waitFor(() => {
      assert.strictEqual(editable().querySelector('strong')?.textContent, 'bold');
    });
    assert.strictEqual(editable().textContent, 'typed **bold**');
    assert.strictEqual(last?.text, 'typed **bold**');
  });

  it('keeps the caret at the same draft offset when an edit restyles the draft', async () => {
    let last: ComposerPromptChange | undefined;
    mount('', next => {
      last = next;
    });
    lexicalEditor().update(() => {
      const text = $createTextNode('a **b** c');
      $getRoot().clear().append($createParagraphNode().append(text));
      text.select(5, 5);
    });
    await waitFor(() => {
      assert.strictEqual(editable().querySelector('strong')?.textContent, 'b');
    });
    assert.deepStrictEqual({ cursor: last?.cursor, text: last?.text }, { cursor: 5, text: 'a **b** c' });
  });

  it('keeps Command Chips alongside styled text', async () => {
    const props = {
      availableCommands: [{ description: 'Show status', name: 'status' }],
      disabled: false,
      onChange: () => undefined,
      onSubmit: () => undefined,
      placeholder: 'Message',
      value: '/status **now**',
    };
    render(<ComposerPromptEditor {...props} />);
    await waitFor(() => {
      assert.strictEqual(editable().querySelector('strong')?.textContent, 'now');
    });
    assert.isNotNull(editable().querySelector('[data-testid="composer-command-chip"]'));
    assert.strictEqual(editable().textContent?.endsWith('**now**'), true);
  });
});

describe('ComposerPromptEditor Marker reveal', () => {
  const activeMarkers = (): readonly string[] =>
    [...editable().querySelectorAll('[data-md-line][data-md-active]')].map(
      element => `${element.getAttribute('data-md-line')}:${element.textContent}`,
    );

  const selectLineTwoItalic = (): void => {
    lexicalEditor().update(() => {
      const nodes = $getRoot().getAllTextNodes();
      nodes.at(4)?.select(0, 0);
    });
  };

  it('shows markers only on the caret line, and none when the editor is not focused', async () => {
    mount('**a**\n_b_');
    await waitFor(() => {
      assert.strictEqual(markers().length, 4);
    });
    assert.deepStrictEqual(activeMarkers(), []);

    editable().focus();
    selectLineTwoItalic();
    await waitFor(() => {
      assert.deepStrictEqual(activeMarkers(), ['1:_', '1:_']);
    });

    editable().blur();
    await waitFor(() => {
      assert.deepStrictEqual(activeMarkers(), []);
    });
  });

  it('reveals a line-leading marker only while the caret is on its line', async () => {
    mount('> q\nplain');
    await waitFor(() => {
      assert.isNotNull(editable().querySelector('[data-md-role="blockMarker"]'));
    });
    editable().focus();
    lexicalEditor().update(() => {
      $getRoot().getAllTextNodes().at(2)?.select(0, 0);
    });
    await waitFor(() => {
      assert.deepStrictEqual(activeMarkers(), []);
    });
    lexicalEditor().update(() => {
      $getRoot().getAllTextNodes().at(1)?.select(0, 0);
    });
    await waitFor(() => {
      assert.deepStrictEqual(activeMarkers(), ['0:> ']);
    });
  });
});
