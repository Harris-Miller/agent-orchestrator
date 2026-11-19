import { assert, it } from '@effect/vitest';
import { Effect, Schema } from 'effect';

import { ConfigOptionIndexDocumentJsonString } from './ConfigOptionIndexDocument.ts';

it.effect('round-trips recommendedValue on select options', () =>
  Effect.gen(function* () {
    const doc = {
      defaultModelId: 'm1',
      unavailableModelIds: [],
      byModel: {
        m1: [
          {
            type: 'select' as const,
            id: 'effort',
            name: 'Effort',
            choices: [{ id: 'low', name: 'Low' }],
            currentValue: 'low',
            recommendedValue: 'high',
          },
        ],
      },
    };
    const json = yield* Schema.encodeEffect(ConfigOptionIndexDocumentJsonString)(doc);
    const decoded = yield* Schema.decodeUnknownEffect(ConfigOptionIndexDocumentJsonString)(json);
    assert.deepStrictEqual(decoded, doc);
  }),
);
