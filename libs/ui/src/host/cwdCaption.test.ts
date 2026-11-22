import { assert, describe, it } from '@effect/vitest';

import { cwdCaption } from './cwdCaption.ts';

describe('cwdCaption', () => {
  it('captions a Project by basename and a contextless directory as contextless', () => {
    assert.strictEqual(cwdCaption('/home/me/work/app'), 'app');
    assert.strictEqual(cwdCaption('/home/me/.hoa/contextless/abc'), 'contextless');
  });
});
