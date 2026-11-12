import { assert, describe, it } from '@effect/vitest';

import type { ComposerTrigger } from '../../chips/composerCommandTokens.ts';
import {
  applyComposerMenuChoice,
  clampComposerMenuFocus,
  CLOSED_COMPOSER_MENU,
  composerMenuAfterChange,
  moveComposerMenuFocus,
} from './composerMenu.ts';

const CODEX = 'codex-acp' as const;

const at = (draft: string) => ({ cursor: draft.length, draft, launchTarget: CODEX, sessionCwd: '/proj' });

const status = { _tag: 'Command', command: { name: 'status' } } as const;
const fileMention = (path: string) => ({ _tag: 'Mention', entry: { kind: 'file', path } }) as const;

describe('applyComposerMenuChoice', () => {
  it('a Command choice replaces the live `/` Trigger (M1)', () => {
    assert.deepStrictEqual(applyComposerMenuChoice(at('/sta'), status), {
      cursor: 8,
      draft: '/status ',
      imagePath: undefined,
    });
  });

  it('a Mention choice inserts the mention markdown (M2)', () => {
    const inserted = '[@a.ts](file:///proj/src/a.ts)';
    assert.deepStrictEqual(applyComposerMenuChoice(at('see @src'), fileMention('src/a.ts')), {
      cursor: 'see '.length + inserted.length + 1,
      draft: `see ${inserted} `,
      imagePath: undefined,
    });
  });

  it('an image Mention removes the Trigger and returns the image path (M3)', () => {
    assert.deepStrictEqual(applyComposerMenuChoice(at('see @im'), fileMention('img/p.png')), {
      cursor: 5,
      draft: 'see  ',
      imagePath: '/proj/img/p.png',
    });
  });

  it('a choice that no longer matches the Trigger under the caret does nothing (M4)', () => {
    assert.isUndefined(applyComposerMenuChoice(at('see @x'), status));
    assert.isUndefined(applyComposerMenuChoice(at('/x'), fileMention('src/a.ts')));
    assert.isUndefined(applyComposerMenuChoice({ ...at('see @src'), sessionCwd: undefined }, fileMention('src/a.ts')));
    assert.isUndefined(applyComposerMenuChoice({ ...at('/sta now'), cursor: 8 }, status));
    assert.isUndefined(applyComposerMenuChoice({ ...at('/sta'), launchTarget: undefined }, status));
  });
});

describe('Composer Menu focus', () => {
  const slash = (query: string, rangeStart = 0): ComposerTrigger => ({
    kind: 'slash',
    query,
    rangeEnd: rangeStart + query.length + 1,
    rangeStart,
  });

  it('a change keeps focus only for the same kind and query (M5)', () => {
    const open = { focus: 3, trigger: slash('sta') };
    assert.deepStrictEqual(composerMenuAfterChange(open, slash('sta', 2)), { focus: 3, trigger: slash('sta', 2) });
    assert.deepStrictEqual(composerMenuAfterChange(open, slash('stat')), { focus: 0, trigger: slash('stat') });
    const dollar: ComposerTrigger = { ...slash('sta'), kind: 'dollar' };
    assert.deepStrictEqual(composerMenuAfterChange(open, dollar), { focus: 0, trigger: dollar });
    assert.deepStrictEqual(composerMenuAfterChange(open, null), CLOSED_COMPOSER_MENU);
    assert.deepStrictEqual(composerMenuAfterChange(CLOSED_COMPOSER_MENU, slash('sta')), {
      focus: 0,
      trigger: slash('sta'),
    });
  });

  it('arrow keys move from the clamped focus and stay in range (M6)', () => {
    const trigger = slash('s');
    assert.strictEqual(moveComposerMenuFocus({ focus: 0, trigger }, 1, 3).focus, 1);
    assert.strictEqual(moveComposerMenuFocus({ focus: 1, trigger }, 1, 2).focus, 1);
    assert.strictEqual(moveComposerMenuFocus({ focus: 0, trigger }, -1, 2).focus, 0);
    assert.strictEqual(moveComposerMenuFocus({ focus: 2, trigger }, 1, 0).focus, 0);
    assert.strictEqual(moveComposerMenuFocus({ focus: 5, trigger }, -1, 2).focus, 0);
    assert.strictEqual(clampComposerMenuFocus(5, 2), 1);
    assert.strictEqual(clampComposerMenuFocus(5, 0), 0);
  });
});
