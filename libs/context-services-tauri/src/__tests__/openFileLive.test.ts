import { assert, describe, it } from '@effect/vitest';
import { OpenFile } from '@lib/context-services';
import { Effect } from 'effect';

import { OpenFileLive } from '../OpenFileLive.ts';

describe('OpenFileLive', () => {
  it.effect('open fails without naming the path (Private data)', () =>
    Effect.gen(function* () {
      const openFile = yield* OpenFile;
      const error = yield* Effect.flip(openFile.open('/Users/someone/secret.png'));
      assert.notInclude(error.message, 'someone');
      assert.notInclude(error.message, 'secret');
    }).pipe(Effect.provide(OpenFileLive)),
  );
});
