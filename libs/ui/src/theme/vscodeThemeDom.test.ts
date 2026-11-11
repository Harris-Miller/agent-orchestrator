// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { Effect } from 'effect';

import { observeVscodeTheme, readVscodeTheme } from './vscodeThemeDom.ts';

/** Lets MutationObserver delivery and the one-frame throttle both run. */
const settle = Effect.promise(
  () =>
    new Promise<void>(resolve => {
      setTimeout(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 0);
        });
      }, 0);
    }),
);

describe('readVscodeTheme', () => {
  it('reads variables and theme kind from the document', () => {
    document.documentElement.style.setProperty('--vscode-sideBar-background', '#f3f3f3');
    document.body.dataset.vscodeThemeKind = 'vscode-light';

    const { colors } = readVscodeTheme(document);

    assert.strictEqual(colors.bgDefault, '#f3f3f3');
    assert.strictEqual(colors.mode, 'light');
  });
});

describe('observeVscodeTheme', () => {
  it.effect('rebuilds once per frame however many VS Code attributes change', () =>
    Effect.gen(function* () {
      let calls = 0;
      const stop = observeVscodeTheme(document, () => {
        calls += 1;
      });

      document.documentElement.style.setProperty('--vscode-foreground', '#111111');
      document.documentElement.style.setProperty('--vscode-focusBorder', '#222222');
      document.body.className = 'vscode-dark';
      document.body.dataset.vscodeThemeKind = 'vscode-dark';
      yield* settle;
      assert.strictEqual(calls, 1);

      document.documentElement.style.setProperty('--vscode-foreground', '#333333');
      yield* settle;
      assert.strictEqual(calls, 2);

      stop();
      document.documentElement.style.setProperty('--vscode-foreground', '#444444');
      yield* settle;
      assert.strictEqual(calls, 2);
    }),
  );

  it.effect('ignores body style changes such as the MUI scroll lock', () =>
    Effect.gen(function* () {
      let calls = 0;
      const stop = observeVscodeTheme(document, () => {
        calls += 1;
      });

      document.body.style.overflow = 'hidden';
      yield* settle;
      stop();

      assert.strictEqual(calls, 0);
    }),
  );
});
