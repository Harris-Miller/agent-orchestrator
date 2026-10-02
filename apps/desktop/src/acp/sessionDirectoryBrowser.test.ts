/** Unit tests for shallow `fd` argv builders (shared helpers live in `@lib/ui`). */
import { assert, describe, it } from '@effect/vitest';
import { shallowDirListingArgs } from '@lib/ui/fd-listing';

describe('shallowDirListingArgs (cwd picker)', () => {
  it('excludes -H when showHidden is false', () => {
    assert.deepStrictEqual(shallowDirListingArgs({ showHidden: false }), ['-t', 'd', '-d', '1', '-0']);
  });

  it('includes -H when showHidden is true', () => {
    assert.deepStrictEqual(shallowDirListingArgs({ showHidden: true }), ['-H', '-t', 'd', '-d', '1', '-0']);
  });
});
