/** Unit tests for shallow `fd` argv builders (shared helpers live in `@lib/ui`). */
import { assert, describe, it } from '@effect/vitest';
import { shallowDirListingArgs } from '@lib/ui/fd-listing';

describe('shallowDirListingArgs (cwd picker)', () => {
  it('excludes -H when showHidden is false and always excludes .git', () => {
    assert.deepStrictEqual(shallowDirListingArgs({ showHidden: false }), ['-t', 'd', '-d', '1', '-E', '.git', '-0']);
  });

  it('includes -H when showHidden is true and still excludes .git', () => {
    assert.deepStrictEqual(shallowDirListingArgs({ showHidden: true }), [
      '-H',
      '-t',
      'd',
      '-d',
      '1',
      '-E',
      '.git',
      '-0',
    ]);
  });

  it('appends Always-hidden globs and never bypasses gitignore', () => {
    const args = shallowDirListingArgs({ alwaysHiddenGlobs: ['node_modules', '.git'], showHidden: true });
    assert.deepStrictEqual(args, ['-H', '-t', 'd', '-d', '1', '-E', '.git', '-E', 'node_modules', '-0']);
    assert.isFalse(args.includes('-I'));
    assert.isFalse(args.some(arg => arg.startsWith('--no-ignore')));
  });
});
