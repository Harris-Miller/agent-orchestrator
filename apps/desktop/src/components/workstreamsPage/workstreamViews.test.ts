import { assert, describe, it } from '@effect/vitest';

import { cwdCaption, trackerChipLabel } from './workstreamViews.ts';

describe('workstreamViews', () => {
  it('labels tracker chips with the provider name', () => {
    assert.strictEqual(trackerChipLabel({ key: '#185', provider: 'github' }), 'GitHub #185');
  });

  it('captions a Project by basename and a contextless directory as contextless', () => {
    assert.strictEqual(cwdCaption('/home/me/work/app'), 'app');
    assert.strictEqual(cwdCaption('/home/me/.hoa/contextless/abc'), 'contextless');
  });
});
