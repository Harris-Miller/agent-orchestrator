import { assert, describe, it } from '@effect/vitest';

import { isOpenableUrl } from './isOpenableUrl.ts';

describe('isOpenableUrl', () => {
  it('allows http and https', () => {
    assert.isTrue(isOpenableUrl('https://example.com/a?b=1'));
    assert.isTrue(isOpenableUrl('http://localhost:3000'));
  });
  it('rejects other schemes and garbage', () => {
    // joined so the literal doesn't trip the no-script-url lint rule
    for (const url of ['file:///etc/passwd', ['javascript', 'alert(1)'].join(':'), 'not a url', '']) {
      assert.isFalse(isOpenableUrl(url));
    }
  });
});
