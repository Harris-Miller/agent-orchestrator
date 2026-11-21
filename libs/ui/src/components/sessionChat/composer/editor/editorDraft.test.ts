import { assert, describe, it } from '@effect/vitest';
import { $getRoot, createEditor } from 'lexical';
import type { LexicalEditor } from 'lexical';

import { mockHostLayer } from '../../../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../../../createHostRuntime.ts';
import { bindHostRuntime } from '../../../../hostRuntime.ts';

import { buildComposerPieces, composerPiecesEqual } from './composerPieces.ts';

// Chip nodes pull in host-bound atoms through their views, so bind before the dynamic imports.
bindHostRuntime(createHostRuntime(mockHostLayer));
const { $getLogicalCursorAndAdjacency, $readEditorPieces, $setComposerContent, $setLogicalCursor } =
  await import('./editorDraft.ts');
const { COMPOSER_NODES } = await import('./nodes/composerChipNode.ts');

const commands = [{ description: 'Show status', isSkill: false, name: 'status' }] as const;
const draft = 'hi /status and [docs](https://x.dev)\nnext';

const makeEditor = () =>
  createEditor({
    namespace: 'editorDraft-test',
    nodes: COMPOSER_NODES,
    onError: error => {
      throw error;
    },
  });

const withDraft = <A>(text: string, read: () => A): A => {
  const editor = makeEditor();
  let result: A | undefined;
  editor.update(
    () => {
      $setComposerContent(text, commands);
      result = read();
    },
    { discrete: true },
  );
  return result as A;
};

describe('editorDraft', () => {
  it('set content then read pieces matches the pieces built from the draft', () => {
    const { pieces, text } = withDraft(draft, () => ({
      pieces: $readEditorPieces(),
      text: $getRoot().getTextContent(),
    }));
    assert.isTrue(composerPiecesEqual(pieces, buildComposerPieces(draft, commands)));
    assert.deepStrictEqual(
      pieces.map(piece => piece.kind),
      ['text', 'command', 'text', 'markdownLink', 'linebreak', 'text'],
    );
    assert.strictEqual(text, draft);
  });

  it('chips count as their source text length for logical cursor offsets', () => {
    const offsets = [0, 2, 3, 3 + '/status'.length, draft.indexOf('[docs]'), draft.length - 2, draft.length];
    for (const offset of offsets) {
      const cursor = withDraft(draft, () => {
        $setLogicalCursor(offset);
        return $getLogicalCursorAndAdjacency().cursor;
      });
      assert.strictEqual(cursor, offset, `offset ${offset}`);
    }
  });

  it('reports adjacency to a chip', () => {
    const afterChip = withDraft(draft, () => {
      $setLogicalCursor(3 + '/status'.length);
      return $getLogicalCursorAndAdjacency();
    });
    assert.isTrue(afterChip.adjacentToToken);
    const plain = withDraft(draft, () => {
      $setLogicalCursor(1);
      return $getLogicalCursorAndAdjacency();
    });
    assert.isFalse(plain.adjacentToToken);
  });

  it('snaps an offset inside a chip to the chip end', () => {
    const chipStart = draft.indexOf('/status');
    const chipEnd = chipStart + '/status'.length;
    const cursor = withDraft(draft, () => {
      $setLogicalCursor(chipStart + 3);
      return $getLogicalCursorAndAdjacency().cursor;
    });
    assert.strictEqual(cursor, chipEnd);
  });

  it('round-trips offsets at the line break after a link chip', () => {
    const newline = draft.indexOf('\n');
    for (const offset of [newline, newline + 1]) {
      const cursor = withDraft(draft, () => {
        $setLogicalCursor(offset);
        return $getLogicalCursorAndAdjacency().cursor;
      });
      assert.strictEqual(cursor, offset, `offset ${offset}`);
    }
  });

  describe('quote lines', () => {
    const quoted = '> a\n> b\nc';

    it('round-trips indented, empty, leading and chip-bearing quote lines', () => {
      for (const text of [' > a', '  > a', '> ', '\n> a', '> /status now']) {
        const { pieces, read } = withDraft(text, () => ({
          pieces: $readEditorPieces(),
          read: $getRoot().getTextContent(),
        }));
        assert.strictEqual(read, text);
        assert.isTrue(composerPiecesEqual(pieces, buildComposerPieces(text, commands)), text);
        assert.isTrue(
          pieces.some(piece => piece.kind === 'quoteLine'),
          text,
        );
      }
    });

    it('round-trips text and pieces', () => {
      const { pieces, text } = withDraft(quoted, () => ({
        pieces: $readEditorPieces(),
        text: $getRoot().getTextContent(),
      }));
      assert.strictEqual(text, quoted);
      assert.isTrue(composerPiecesEqual(pieces, buildComposerPieces(quoted, commands)));
      assert.deepStrictEqual(
        pieces.map(piece => piece.kind),
        ['quoteLine', 'linebreak', 'quoteLine', 'linebreak', 'text'],
      );
    });

    it('round-trips the logical cursor at every offset', () => {
      for (let offset = 0; offset <= quoted.length; offset += 1) {
        const cursor = withDraft(quoted, () => {
          $setLogicalCursor(offset);
          return $getLogicalCursorAndAdjacency().cursor;
        });
        assert.strictEqual(cursor, offset, `offset ${offset}`);
      }
    });

    it('survives a serialized editor state round-trip', () => {
      const source = makeEditor();
      source.update(
        () => {
          $setComposerContent(quoted, commands);
        },
        { discrete: true },
      );
      const target: LexicalEditor = makeEditor();
      target.setEditorState(target.parseEditorState(JSON.stringify(source.getEditorState().toJSON())));
      const { pieces, text } = target.getEditorState().read(() => ({
        pieces: $readEditorPieces(),
        text: $getRoot().getTextContent(),
      }));
      assert.strictEqual(text, quoted);
      assert.isTrue(composerPiecesEqual(pieces, buildComposerPieces(quoted, commands)));
    });
  });
});
