import { assert, describe, it } from '@effect/vitest';
import { Clipboard, ClipboardReadFailed, ClipboardWriteFailed } from '@lib/context-services';
import { Effect } from 'effect';

import { ClipboardLive } from '../ClipboardLive.ts';

describe('ClipboardLive', () => {
  it.effect('writeText and readText round-trip via navigator.clipboard', () =>
    Effect.gen(function* () {
      let stored = '';
      const original = globalThis.navigator;
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          clipboard: {
            readText: () => Promise.resolve(stored),
            writeText: (text: string) => {
              stored = text;
              return Promise.resolve();
            },
          },
        },
      });

      try {
        const clipboard = yield* Clipboard.pipe(Effect.provide(ClipboardLive));
        yield* clipboard.writeText('hello');
        assert.strictEqual(yield* clipboard.readText(), 'hello');
      } finally {
        Object.defineProperty(globalThis, 'navigator', {
          configurable: true,
          value: original,
        });
      }
    }),
  );

  it.effect('writeText fails with ClipboardWriteFailed when write rejects', () =>
    Effect.gen(function* () {
      const original = globalThis.navigator;
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          clipboard: {
            readText: () => Promise.resolve(''),
            writeText: () => Promise.reject(new Error('denied')),
          },
        },
      });

      try {
        const clipboard = yield* Clipboard.pipe(Effect.provide(ClipboardLive));
        const error = yield* clipboard.writeText('x').pipe(Effect.flip);
        assert.strictEqual(error._tag, 'ClipboardWriteFailed');
        assert.ok(error instanceof ClipboardWriteFailed);
      } finally {
        Object.defineProperty(globalThis, 'navigator', {
          configurable: true,
          value: original,
        });
      }
    }),
  );

  it.effect('readText fails with ClipboardReadFailed when read rejects', () =>
    Effect.gen(function* () {
      const original = globalThis.navigator;
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          clipboard: {
            readText: () => Promise.reject(new Error('denied')),
            writeText: () => Promise.resolve(),
          },
        },
      });

      try {
        const clipboard = yield* Clipboard.pipe(Effect.provide(ClipboardLive));
        const error = yield* clipboard.readText().pipe(Effect.flip);
        assert.strictEqual(error._tag, 'ClipboardReadFailed');
        assert.ok(error instanceof ClipboardReadFailed);
      } finally {
        Object.defineProperty(globalThis, 'navigator', {
          configurable: true,
          value: original,
        });
      }
    }),
  );
});
