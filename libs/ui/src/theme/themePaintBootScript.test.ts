import { assert, describe, it } from '@effect/vitest';

import { runInNewContext } from 'node:vm';

import type { ThemeId } from './themeId.ts';
import { paintDocumentTheme, resolvePaintThemeId, themePaintBootScript } from './themePaintBootScript.ts';
import { applyDocumentTheme } from './themePaintCache.ts';

type Painted = {
  readonly dark: boolean;
  readonly theme: string | undefined;
};

const fakeDocument = (): { readonly document: object; readonly painted: () => Painted } => {
  const classNames = new Set<string>();
  const dataset: { theme?: string } = {};
  return {
    document: {
      documentElement: {
        classList: {
          toggle(token: string, force: boolean) {
            if (force) {
              classNames.add(token);
            } else {
              classNames.delete(token);
            }
          },
        },
        dataset,
      },
    },
    painted: () => ({ dark: classNames.has('dark'), theme: dataset.theme }),
  };
};

const paintWithBootScript = (readStored: () => null | string): Painted => {
  const fake = fakeDocument();
  runInNewContext(themePaintBootScript, {
    document: fake.document,
    localStorage: { getItem: readStored },
  });
  return fake.painted();
};

const paintWithApply = (themeId: ThemeId): Painted => {
  const fake = fakeDocument();
  const hadDocument = 'document' in globalThis;
  const previous = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fake.document });
  try {
    applyDocumentTheme(themeId);
  } finally {
    if (hadDocument) {
      Object.defineProperty(globalThis, 'document', { configurable: true, value: previous });
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }
  }
  return fake.painted();
};

describe('themePaintBootScript', () => {
  it('embeds the same clamp and document write that applyDocumentTheme runs', () => {
    assert.include(themePaintBootScript, resolvePaintThemeId.toString());
    assert.include(themePaintBootScript, paintDocumentTheme.toString());
    assert.deepStrictEqual(
      paintWithBootScript(() => 'mocha'),
      paintWithApply('mocha'),
    );
    assert.deepStrictEqual(
      paintWithBootScript(() => 'latte'),
      paintWithApply('latte'),
    );
    assert.deepStrictEqual(
      paintWithBootScript(() => 'nope'),
      paintWithApply('original'),
    );
    assert.deepStrictEqual(
      paintWithBootScript(() => null),
      paintWithApply('original'),
    );
  });

  it('leaves the document unchanged when the paint cache throws', () => {
    assert.deepStrictEqual(
      paintWithBootScript(() => {
        throw new Error('storage blocked');
      }),
      { dark: false, theme: undefined },
    );
  });
});
