/** A hub tool handler gets the app's registry and the Host services (what `sendPromptTurn` needs) with every call. */
import { assert, describe, it } from '@effect/vitest';
import { Notifier } from '@lib/context-services';
import { Effect, Schema } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';

import { mockHostLayer } from '../atoms/mockHostLayer.testing.ts';

import { hubToolHandler } from './hubToolHandler.ts';

describe('hubToolHandler', () => {
  it.effect('passes the registry and runs with Host services', () =>
    Effect.gen(function* () {
      const registry = AtomRegistry.make();
      const counter = Atom.make(41);
      registry.set(counter, 42);
      const handler = hubToolHandler(Schema.Struct({ n: Schema.Number }), ({ n }, _caller, ctx) =>
        Effect.gen(function* () {
          const notifier = yield* Notifier;
          return { isError: false, text: `${n + ctx.registry.get(counter)} ${notifier.supported}` };
        }),
      );

      const result = yield* handler({ n: 1 }, { launchTarget: 'codex-acp', sessionId: 's' }, { registry });

      assert.deepStrictEqual(result, { isError: false, text: '43 os' });
    }).pipe(Effect.provide(mockHostLayer)),
  );

  it.effect('turns undecodable arguments into a tool error', () =>
    Effect.gen(function* () {
      const handler = hubToolHandler(Schema.Struct({ n: Schema.Number }), () =>
        Effect.succeed({ isError: false, text: 'ran' }),
      );
      const result = yield* handler(
        { n: 'x' },
        { launchTarget: 'codex-acp', sessionId: 's' },
        {
          registry: AtomRegistry.make(),
        },
      );
      assert.isTrue(result.isError);
    }).pipe(Effect.provide(mockHostLayer)),
  );
});
