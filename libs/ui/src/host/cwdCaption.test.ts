import { assert, describe, it } from '@effect/vitest';
import { join, resolve } from 'node:path';

import { cwdCaption } from './cwdCaption.ts';

describe('cwdCaption', () => {
  it('captions a Project by basename and a contextless directory as contextless', () => {
    assert.strictEqual(cwdCaption(resolve('home', 'me', 'work', 'app')), 'app');
    assert.strictEqual(cwdCaption(join(resolve('home', 'me'), '.hoa', 'contextless', 'abc')), 'contextless');
  });

  it('recognises a Windows (backslash) contextless path', () => {
    assert.strictEqual(cwdCaption('C:\\Users\\me\\.hoa\\contextless\\abc'), 'contextless');
  });
});
