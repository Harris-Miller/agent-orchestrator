import { DARK_THEME_IDS, LIGHT_THEME_IDS } from '../../theme/themes.ts';
import { assert, describe, it } from '@effect/vitest';

import {
  basenameForLookup,
  isPathLikeHref,
  logicalKeyForBasename,
  packIdForTheme,
  resolveFileChipIcon,
} from './resolveFileChipIcon.ts';

describe('resolveFileChipIcon', () => {
  it('prefers href for file vs URL kind', () => {
    const file = resolveFileChipIcon({ href: 'file:///tmp/package.json', label: '@package.json' }, 'default-dark');
    assert.strictEqual(file.kind, 'svg');

    const url = resolveFileChipIcon({ href: 'https://example.com/docs', label: 'docs' }, 'mocha');
    assert.strictEqual(url.kind, 'lucide');
  });

  it('maps package.json key and unknown basename to default file svg', () => {
    const pkg = resolveFileChipIcon({ href: 'file:///repo/package.json', label: '@package.json' }, 'default-dark');
    assert.strictEqual(pkg.kind, 'svg');
    if (pkg.kind === 'svg') {
      assert.match(pkg.url, /^data:image\/svg\+xml/);
    }

    const unknown = resolveFileChipIcon({ href: 'file:///repo/weird.zzz', label: '@weird.zzz' }, 'latte');
    const fallback = resolveFileChipIcon({ href: 'file:///repo/README.md', label: '@README.md' }, 'latte');
    assert.strictEqual(unknown.kind, 'svg');
    assert.strictEqual(fallback.kind, 'svg');
    if (unknown.kind === 'svg' && fallback.kind === 'svg') {
      // unknown uses default-file; md uses markdown icon — URLs differ
      assert.notStrictEqual(unknown.url, fallback.url);
    }
  });

  it('strips @ from label only for lookup when href is absent', () => {
    assert.strictEqual(basenameForLookup('@foo.ts'), 'foo.ts');
    assert.strictEqual(logicalKeyForBasename(basenameForLookup('@foo.ts')), 'ts');
    const fromLabel = resolveFileChipIcon({ label: '@foo.ts' }, 'default-dark');
    const fromHref = resolveFileChipIcon({ href: 'file:///tmp/foo.ts', label: '@other' }, 'default-dark');
    assert.strictEqual(fromLabel.kind, 'svg');
    assert.strictEqual(fromHref.kind, 'svg');
    if (fromLabel.kind === 'svg' && fromHref.kind === 'svg') {
      assert.strictEqual(fromLabel.url, fromHref.url);
    }
  });

  it('treats trailing slash as folder default', () => {
    const folder = resolveFileChipIcon({ href: 'file:///repo/src/', label: '@src' }, 'frappe');
    assert.strictEqual(folder.kind, 'svg');
    assert.strictEqual(packIdForTheme('frappe'), 'catppuccin-mocha');
  });

  it('maps every palette to a pack', () => {
    assert.strictEqual(packIdForTheme('default-dark'), 'original');
    for (const id of DARK_THEME_IDS.filter(t => t !== 'default-dark')) {
      assert.strictEqual(packIdForTheme(id), 'catppuccin-mocha', id);
    }
    for (const id of LIGHT_THEME_IDS) {
      assert.strictEqual(packIdForTheme(id), 'catppuccin-latte', id);
    }
  });

  it('classifies path-like hrefs', () => {
    assert.strictEqual(isPathLikeHref('file:///tmp/a.ts'), true);
    assert.strictEqual(isPathLikeHref('./README.md'), true);
    assert.strictEqual(isPathLikeHref('https://example.com'), false);
    assert.strictEqual(isPathLikeHref('mailto:a@b.c'), false);
  });
});
