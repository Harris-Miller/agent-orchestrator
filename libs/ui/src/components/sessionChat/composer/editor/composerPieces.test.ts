import { assert, describe, it } from '@effect/vitest';

import {
  buildComposerPieces,
  composerPiecesEqual,
  composerPieceText,
  mergeAdjacentTextPieces,
} from './composerPieces.ts';
import type { ComposerPiece } from './composerPieces.ts';

const commands = [{ description: 'Show status', isSkill: false, name: 'status' }] as const;

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
    case 'quoteLine': {
      return `quote[${piece.pieces.map(showPiece).join(',')}]`;
    }
    case 'text': {
      const { style } = piece;
      const role = { blockMarker: 'b', fence: 'f', marker: 'm', text: '' }[style.role];
      const flags = `${style.bold ? 'b' : ''}${style.italic ? 'i' : ''}${style.strike ? 's' : ''}${style.code ? 'c' : ''}`;
      return `text:${role}${flags}@${style.block}/${style.span}:${piece.value}`;
    }
  }
};

const show = (text: string): readonly string[] => buildComposerPieces(text, commands).map(showPiece);

describe('buildComposerPieces', () => {
  it('returns no pieces for an empty draft', () => {
    assert.deepStrictEqual(buildComposerPieces('', commands), []);
  });

  it('splits chips out of styled text', () => {
    assert.deepStrictEqual(show('/status more'), ['cmd:/status', 'text:@paragraph/: more']);
    assert.deepStrictEqual(show('see [a](/b) now'), ['text:@paragraph/:see ', 'link:a', 'text:@paragraph/: now']);
  });

  it('keeps a chip inside bold and does not parse inside it', () => {
    assert.deepStrictEqual(show('**a /status b**'), [
      'text:m@paragraph/0:0:**',
      'text:b@paragraph/:a ',
      'cmd:/status',
      'text:b@paragraph/: b',
      'text:m@paragraph/0:0:**',
    ]);
    assert.deepStrictEqual(show('[**a**](/b)'), ['link:**a**']);
  });

  it('gives block markers no span', () => {
    assert.deepStrictEqual(show('a\n> q'), ['text:@paragraph/:a', 'br', 'quote[text:b@quote/:> ,text:@quote/:q]']);
  });

  it('wraps each quote line in its own quoteLine piece, outside the linebreaks', () => {
    const pieces = buildComposerPieces('> a\n> b\nplain', commands);
    assert.deepStrictEqual(
      pieces.map(piece => piece.kind),
      ['quoteLine', 'linebreak', 'quoteLine', 'linebreak', 'text'],
    );
    assert.strictEqual(pieces.map(composerPieceText).join(''), '> a\n> b\nplain');
  });

  it('wraps quote lines however they are written, keeping the draft text', () => {
    const cases: readonly (readonly [string, readonly string[]])[] = [
      [' > a', ['quoteLine']],
      ['  > a', ['quoteLine']],
      ['> ', ['quoteLine']],
      ['> a', ['quoteLine']],
      ['\n> a', ['linebreak', 'quoteLine']],
      ['a\n  > b', ['text', 'linebreak', 'quoteLine']],
    ];
    for (const [text, kinds] of cases) {
      const pieces = buildComposerPieces(text, commands);
      assert.deepStrictEqual(
        pieces.map(piece => piece.kind),
        kinds,
        text,
      );
      assert.strictEqual(pieces.map(composerPieceText).join(''), text, text);
    }
  });

  it('nests a chip inside its quote line', () => {
    assert.deepStrictEqual(show('> /status now'), ['quote[text:b@quote/:> ,cmd:/status,text:@quote/: now]']);
  });

  it("emits a linebreak piece between lines and ties each span's markers together", () => {
    assert.deepStrictEqual(show('**a**\n_b_'), [
      'text:m@paragraph/0:0:**',
      'text:b@paragraph/:a',
      'text:m@paragraph/0:0:**',
      'br',
      'text:m@paragraph/1:0:_',
      'text:i@paragraph/:b',
      'text:m@paragraph/1:0:_',
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
    style: { block: 'paragraph', bold, code: false, italic: false, role: 'text', span: '', strike: false },
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

  it('compares quote lines by their children, merging inside them', () => {
    const quote = (...pieces: ComposerPiece[]): ComposerPiece => ({ kind: 'quoteLine', pieces });
    assert.isTrue(composerPiecesEqual([quote(piece('a'), piece('b'))], [quote(piece('ab'))]));
    assert.isFalse(composerPiecesEqual([quote(piece('ab'))], [piece('ab')]));
    assert.isFalse(composerPiecesEqual([quote(piece('ab'))], [quote(piece('ab', true))]));
  });
});
