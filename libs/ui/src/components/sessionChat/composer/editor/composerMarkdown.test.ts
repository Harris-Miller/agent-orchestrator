import { assert, describe, it } from '@effect/vitest';

import { parseComposerMarkdown } from './composerMarkdown.ts';
import type { MarkdownRun } from './composerMarkdown.ts';

const flags = (run: MarkdownRun): string =>
  `${run.bold ? 'b' : ''}${run.italic ? 'i' : ''}${run.strike ? 's' : ''}${run.code ? 'c' : ''}`;

/** One string per run: `<role marker 'm'><style flags>:<text>`; plain text has empty flags. */
const show = (text: string): readonly (readonly string[])[] =>
  parseComposerMarkdown(text).map(line =>
    line.map(run => `${run.role === 'marker' || run.role === 'blockMarker' ? 'm' : ''}${flags(run)}:${run.text}`),
  );

const assertPlain = (text: string): void => {
  assert.deepStrictEqual(show(text), [[`:${text}`]], `expected plain: ${text}`);
};

/** One string per run: `<block>:<m|f|empty role>:<text>`. */
const showBlocks = (text: string): readonly (readonly string[])[] =>
  parseComposerMarkdown(text).map(line =>
    line.map(run => `${run.block}:${{ blockMarker: 'b', fence: 'f', marker: 'm', text: '' }[run.role]}:${run.text}`),
  );

describe('parseComposerMarkdown blocks', () => {
  it('marks ATX headings by level and requires a space after the hashes', () => {
    assert.deepStrictEqual(showBlocks('# Title'), [['h1:b:# ', 'h1::Title']]);
    assert.deepStrictEqual(showBlocks('###### six'), [['h6:b:###### ', 'h6::six']]);
    assert.deepStrictEqual(showBlocks('  ## indented'), [['h2::  ', 'h2:b:## ', 'h2::indented']]);
    for (const plain of ['#', '#123', '####### seven', 'a # b']) {
      assert.deepStrictEqual(showBlocks(plain), [[`paragraph::${plain}`]]);
    }
  });

  it('marks block quotes, including nested markers, only at line start', () => {
    assert.deepStrictEqual(showBlocks('> quote'), [['quote:b:> ', 'quote::quote']]);
    for (const plain of ['>', '>tight', '>> deep']) {
      assert.deepStrictEqual(showBlocks(plain), [[`paragraph::${plain}`]]);
    }
    assert.deepStrictEqual(showBlocks('> > deep'), [['quote:b:> > ', 'quote::deep']]);
    assert.deepStrictEqual(showBlocks('a > b'), [['paragraph::a > b']]);
  });

  it('marks bullet and ordered list items, keeping indentation as text', () => {
    assert.deepStrictEqual(showBlocks('- item'), [['bullet:b:- ', 'bullet::item']]);
    assert.deepStrictEqual(showBlocks('+ item'), [['bullet:b:+ ', 'bullet::item']]);
    assert.deepStrictEqual(showBlocks('  * nested'), [['bullet::  ', 'bullet:b:* ', 'bullet::nested']]);
    assert.deepStrictEqual(showBlocks('1. one'), [['ordered:b:1. ', 'ordered::one']]);
    assert.deepStrictEqual(showBlocks('12) twelve'), [['ordered:b:12) ', 'ordered::twelve']]);
    for (const plain of ['-', '*', '1.', '-item', '---', '1.5 is a number', '*not a list*x']) {
      assert.notStrictEqual(showBlocks(plain)[0][0].slice(0, 7), 'bullet:', plain);
      assert.notStrictEqual(showBlocks(plain)[0][0].slice(0, 8), 'ordered:', plain);
    }
  });

  it('keeps inline markers inside a block as inline markers', () => {
    assert.deepStrictEqual(showBlocks('> **b**'), [['quote:b:> ', 'quote:m:**', 'quote::b', 'quote:m:**']]);
  });

  it('styles inline Markdown inside a block after its marker', () => {
    assert.deepStrictEqual(show('> **b**'), [['m:> ', 'm:**', 'b:b', 'm:**']]);
    assert.deepStrictEqual(show('# a `c`'), [['m:# ', ':a ', 'm:`', 'c:c', 'm:`']]);
    assert.deepStrictEqual(show('- _i_'), [['m:- ', 'm:_', 'i:i', 'm:_']]);
  });

  it('treats fenced code as raw lines with always-shown fences', () => {
    assert.deepStrictEqual(showBlocks('```ts\n**x**\n- a\n```\nafter'), [
      ['codeBlock:f:```ts'],
      ['codeBlock::**x**'],
      ['codeBlock::- a'],
      ['codeBlock:f:```'],
      ['paragraph::after'],
    ]);
  });

  it('keeps an unterminated fence open to the end and needs a matching closing fence', () => {
    assert.deepStrictEqual(showBlocks('```\n**x**'), [['codeBlock:f:```'], ['codeBlock::**x**']]);
    assert.deepStrictEqual(showBlocks('~~~\n```\n~~~'), [['codeBlock:f:~~~'], ['codeBlock::```'], ['codeBlock:f:~~~']]);
    assert.deepStrictEqual(showBlocks('````\n```\n````'), [
      ['codeBlock:f:````'],
      ['codeBlock::```'],
      ['codeBlock:f:````'],
    ]);
  });

  it('does not open a backtick fence whose info string has a backtick', () => {
    assert.deepStrictEqual(showBlocks('```a`b'), [['paragraph::```a`b']]);
  });

  it('keeps empty lines', () => {
    assert.deepStrictEqual(showBlocks('# a\n\nb'), [['h1:b:# ', 'h1::a'], [], ['paragraph::b']]);
  });
});

describe('parseComposerMarkdown inline', () => {
  it('styles bold, italic, strikethrough, and inline code', () => {
    assert.deepStrictEqual(show('a **b** c'), [[':a ', 'm:**', 'b:b', 'm:**', ': c']]);
    assert.deepStrictEqual(show('a *b* c'), [[':a ', 'm:*', 'i:b', 'm:*', ': c']]);
    assert.deepStrictEqual(show('a _b_ c'), [[':a ', 'm:_', 'i:b', 'm:_', ': c']]);
    assert.deepStrictEqual(show('a __b__ c'), [[':a ', 'm:__', 'b:b', 'm:__', ': c']]);
    assert.deepStrictEqual(show('a ~~b~~ c'), [[':a ', 'm:~~', 's:b', 'm:~~', ': c']]);
    assert.deepStrictEqual(show('a `b` c'), [[':a ', 'm:`', 'c:b', 'm:`', ': c']]);
  });

  it('gives the opening and closing marker of a span one shared span id', () => {
    const [line] = parseComposerMarkdown('**a** _b_ plain');
    assert.deepStrictEqual(
      line.map(run => run.span),
      [0, -1, 0, -1, 1, -1, 1, -1],
    );
  });

  it('nests bold and italic', () => {
    assert.deepStrictEqual(show('***x***'), [['m:*', 'm:**', 'bi:x', 'm:**', 'm:*']]);
    assert.deepStrictEqual(show('**a *b* c**'), [['m:**', 'b:a ', 'm:*', 'bi:b', 'm:*', 'b: c', 'm:**']]);
  });

  it('styles at line start and end and after opening punctuation', () => {
    assert.deepStrictEqual(show('**b**'), [['m:**', 'b:b', 'm:**']]);
    assert.deepStrictEqual(show('("**b**")'), [[':("', 'm:**', 'b:b', 'm:**', ':")']]);
    assert.deepStrictEqual(show('**b**.'), [['m:**', 'b:b', 'm:**', ':.']]);
  });

  it('keeps code span content raw', () => {
    assert.deepStrictEqual(show('`**x**`'), [['m:`', 'c:**x**', 'm:`']]);
    assert.deepStrictEqual(show('`` a`b ``'), [['m:``', 'c: a`b ', 'm:``']]);
  });

  it('styles each line independently', () => {
    assert.deepStrictEqual(show('**a\nb**'), [[':**a'], [':b**']]);
    assert.deepStrictEqual(show('**a**\n_b_'), [
      ['m:**', 'b:a', 'm:**'],
      ['m:_', 'i:b', 'm:_'],
    ]);
  });

  it('keeps prompt text that merely looks like Markdown plain', () => {
    for (const text of [
      'snake_case_name',
      'a__b__c',
      'src/**/*.ts and src/**/*.tsx',
      '**/*.test.ts',
      '2*3*4',
      'a * b * c',
      '** not bold **',
      '**oops',
      '`unclosed',
      'a**b**c',
      '~single~ and ~~~three~~~',
      'x_y_z',
      '1 < 2 > 1',
      'trailing *',
    ]) {
      assertPlain(text);
    }
    assert.deepStrictEqual(show(''), [[]]);
  });

  it('treats backslash-escaped delimiters as text', () => {
    assertPlain('\\*not italic\\*');
    assertPlain('\\`not code\\`');
  });

  it('covers every input character exactly once', () => {
    const text = 'a **b** `c` _d_ ~~e~~ \\* f\n> **g**\n- [ ] h\n```\n**i**\n```';
    const joined = parseComposerMarkdown(text)
      .map(line => line.map(run => run.text).join(''))
      .join('\n');
    assert.strictEqual(joined, text);
  });
});
