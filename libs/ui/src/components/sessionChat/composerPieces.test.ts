import { assert, describe, it } from '@effect/vitest';

import {
  buildComposerPieces,
  composerPiecesEqual,
  composerPieceText,
  mergeAdjacentTextPieces,
} from './composerPieces.ts';
import type { ComposerPiece } from './composerPieces.ts';

const commands = [{ description: 'Show status', name: 'status' }] as const;

/** Compact form: `text:<role m|f|empty><flags>:<value>`, `cmd:<value>`, `link:<label>`, `br`. */
const showPiece = (piece: ComposerPiece): string => {
  switch (piece.kind) {
    case 'command': {
      return `cmd:${piece.value}`;
    }
    case 'linebreak': {
      return 'br';
    }
    case 'markdownLink': {
      return `link:${piece.label}`;
    }
    case 'text': {
      const { style } = piece;
      const role = { blockMarker: 'b', fence: 'f', marker: 'm', text: '' }[style.role];
      const flags = `${style.bold ? 'b' : ''}${style.italic ? 'i' : ''}${style.strike ? 's' : ''}${style.code ? 'c' : ''}`;
      return `text:${role}${flags}@${style.block}/${style.line}:${piece.value}`;
    }
  }
};

const show = (text: string): readonly string[] => buildComposerPieces(text, commands).map(showPiece);

describe('buildComposerPieces', () => {
  it('returns no pieces for an empty draft', () => {
    assert.deepStrictEqual(buildComposerPieces('', commands), []);
  });

  it('splits chips out of styled text', () => {
    assert.deepStrictEqual(show('/status more'), ['cmd:/status', 'text:@paragraph/0: more']);
    assert.deepStrictEqual(show('see [a](/b) now'), ['text:@paragraph/0:see ', 'link:a', 'text:@paragraph/0: now']);
  });

  it('keeps a chip inside bold and does not parse inside it', () => {
    assert.deepStrictEqual(show('**a /status b**'), [
      'text:m@paragraph/0:**',
      'text:b@paragraph/0:a ',
      'cmd:/status',
      'text:b@paragraph/0: b',
      'text:m@paragraph/0:**',
    ]);
    assert.deepStrictEqual(show('[**a**](/b)'), ['link:**a**']);
  });

  it('numbers the line of a block marker', () => {
    assert.deepStrictEqual(show('a\n> q'), ['text:@paragraph/0:a', 'br', 'text:b@quote/1:> ', 'text:@quote/0:q']);
  });

  it('emits a linebreak piece between lines and numbers marker lines', () => {
    assert.deepStrictEqual(show('**a**\n_b_'), [
      'text:m@paragraph/0:**',
      'text:b@paragraph/0:a',
      'text:m@paragraph/0:**',
      'br',
      'text:m@paragraph/1:_',
      'text:i@paragraph/0:b',
      'text:m@paragraph/1:_',
    ]);
  });

  it('reproduces the draft text exactly', () => {
    for (const text of [
      '',
      'plain',
      '/status **b** and [a](/b)\n> quote `c`\n- item\n```\n/status\n```\nend',
      'src/**/*.ts\n\n\n# h',
      'x [a\nb](c) y',
    ]) {
      assert.strictEqual(buildComposerPieces(text, commands).map(composerPieceText).join(''), text);
    }
  });
});

describe('mergeAdjacentTextPieces and composerPiecesEqual', () => {
  const piece = (value: string, bold = false): ComposerPiece => ({
    kind: 'text',
    style: { block: 'paragraph', bold, code: false, italic: false, line: 0, role: 'text', strike: false },
    value,
  });

  it('merges neighbours with equal style only', () => {
    assert.deepStrictEqual(mergeAdjacentTextPieces([piece('a'), piece('b'), piece('c', true), piece('d')]), [
      piece('ab'),
      piece('c', true),
      piece('d'),
    ]);
  });

  it('compares structurally after merging', () => {
    assert.isTrue(composerPiecesEqual([piece('a'), piece('b')], [piece('ab')]));
    assert.isFalse(composerPiecesEqual([piece('ab')], [piece('ab', true)]));
    assert.isFalse(composerPiecesEqual([piece('ab')], [piece('ab'), { kind: 'linebreak' }]));
  });
});
