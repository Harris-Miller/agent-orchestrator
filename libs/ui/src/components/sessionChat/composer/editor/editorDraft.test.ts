import { assert, describe, it } from '@effect/vitest';
import { $getRoot, createEditor } from 'lexical';

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

  it('round-trips quote lines through serialized editor state', () => {
    const quoteDraft = '> a\n> b\nplain\n> c';
    const source = makeEditor();
    source.update(
      () => {
        $setComposerContent(quoteDraft, commands);
      },
      { discrete: true },
    );
    const json = JSON.stringify(source.getEditorState().toJSON());
    const target = makeEditor();
    target.setEditorState(target.parseEditorState(json));
    const { pieces, text } = target.read(() => ({ pieces: $readEditorPieces(), text: $getRoot().getTextContent() }));
    assert.strictEqual(text, quoteDraft);
    assert.isTrue(composerPiecesEqual(pieces, buildComposerPieces(quoteDraft, commands)));
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

  it('keeps text, pieces, and logical cursors intact for drafts with quote lines', () => {
    for (const quoted of ['> q', 'a\n> b\n> c', '> a /status [d](/e)\n> ', '> > deep\nend', '> \n> ']) {
      const { pieces, text } = withDraft(quoted, () => ({
        pieces: $readEditorPieces(),
        text: $getRoot().getTextContent(),
      }));
      assert.strictEqual(text, quoted);
      assert.isTrue(composerPiecesEqual(pieces, buildComposerPieces(quoted, commands)), quoted);
      for (let offset = 0; offset <= quoted.length; offset += 1) {
        const cursor = withDraft(quoted, () => {
          $setLogicalCursor(offset);
          return $getLogicalCursorAndAdjacency().cursor;
        });
        // An offset inside a chip snaps to its end; everything else round-trips.
        const chipStart = quoted.indexOf('/status');
        const inChip = chipStart !== -1 && offset > chipStart && offset < chipStart + '/status'.length;
        const linkStart = quoted.indexOf('[d]');
        const inLink = linkStart !== -1 && offset > linkStart && offset < linkStart + '[d](/e)'.length;
        if (!inChip && !inLink) {
          assert.strictEqual(cursor, offset, `${JSON.stringify(quoted)} @ ${offset}`);
        }
      }
    }
  });
});
