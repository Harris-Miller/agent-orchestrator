import { assert, describe, it } from '@effect/vitest';

import { classifyClipboardPaste, classifyFileDrop, NOT_IMAGES_MESSAGE } from './composerImageTransfer.ts';

const png = new File(['x'], 'a.png', { type: 'image/png' });
const bmp = new File(['x'], 'a.bmp', { type: 'image/bmp' });
const txt = new File(['x'], 'a.txt', { type: 'text/plain' });

describe('classifyClipboardPaste', () => {
  it('ignores when text is present (mixed clipboard), even whitespace', () => {
    assert.deepStrictEqual(classifyClipboardPaste({ files: [png], text: ' ' }), { _tag: 'Ignore' });
  });
  it('returns image files when there is no text', () => {
    assert.deepStrictEqual(classifyClipboardPaste({ files: [txt, png], text: '' }), { _tag: 'Images', files: [png] });
  });
  it('ignores when no image files', () => {
    assert.deepStrictEqual(classifyClipboardPaste({ files: [txt], text: '' }), { _tag: 'Ignore' });
    assert.deepStrictEqual(classifyClipboardPaste({ files: [], text: '' }), { _tag: 'Ignore' });
  });
  it('passes disallowed image mimes through', () => {
    assert.deepStrictEqual(classifyClipboardPaste({ files: [bmp], text: '' }), { _tag: 'Images', files: [bmp] });
  });
});

describe('classifyFileDrop', () => {
  it('ignores no files', () => {
    assert.deepStrictEqual(classifyFileDrop({ files: [] }), { _tag: 'Ignore' });
  });
  it('reports non-image files', () => {
    assert.deepStrictEqual(classifyFileDrop({ files: [txt] }), { _tag: 'NotImages', message: NOT_IMAGES_MESSAGE });
  });
  it('keeps images from a mixed drop and reports the skipped rest', () => {
    assert.deepStrictEqual(classifyFileDrop({ files: [txt, png] }), {
      _tag: 'Images',
      files: [png],
      skippedMessage: NOT_IMAGES_MESSAGE,
    });
  });
  it('has no skipped message for an images-only drop', () => {
    assert.deepStrictEqual(classifyFileDrop({ files: [png] }), { _tag: 'Images', files: [png] });
  });
});
