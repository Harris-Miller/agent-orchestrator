import { assert, describe, it } from '@effect/vitest';
import { Schema } from 'effect';

import {
  ClientCapabilities,
  clientSupportsFormElicitation,
  CreateElicitationRequestBody,
  CreateElicitationResponseBody,
} from './elicitation.ts';

describe('elicitation schemas', () => {
  it('decodes form session elicitation request', () => {
    const decoded = Schema.decodeSync(CreateElicitationRequestBody)({
      message: 'Pick a strategy',
      mode: 'form',
      requestedSchema: {
        properties: {
          strategy: {
            enum: ['conservative', 'balanced', 'aggressive'],
            type: 'string',
          },
        },
        required: ['strategy'],
        type: 'object',
      },
      sessionId: 'sess_1',
    });

    assert.ok('mode' in decoded && decoded.mode === 'form');
    assert.ok('sessionId' in decoded && decoded.sessionId === 'sess_1');
  });

  it('decodes accept / decline / cancel responses', () => {
    assert.deepStrictEqual(
      Schema.decodeSync(CreateElicitationResponseBody)({ action: 'accept', content: { strategy: 'balanced' } }),
      {
        action: 'accept',
        content: { strategy: 'balanced' },
      },
    );
    assert.deepStrictEqual(Schema.decodeSync(CreateElicitationResponseBody)({ action: 'decline' }), {
      action: 'decline',
    });
    assert.deepStrictEqual(Schema.decodeSync(CreateElicitationResponseBody)({ action: 'cancel' }), {
      action: 'cancel',
    });
  });

  it('decodes clientCapabilities.elicitation.form', () => {
    const decoded = Schema.decodeSync(ClientCapabilities)({
      elicitation: { form: {} },
      terminal: false,
    });
    assert.deepStrictEqual(decoded.elicitation, { form: {} });
  });

  it('clientSupportsFormElicitation requires present non-null form', () => {
    assert.strictEqual(clientSupportsFormElicitation({ elicitation: { form: {} } }), true);
    assert.strictEqual(clientSupportsFormElicitation({ elicitation: { form: null } }), false);
    assert.strictEqual(clientSupportsFormElicitation({ elicitation: { url: {} } }), false);
    assert.strictEqual(clientSupportsFormElicitation({}), false);
    assert.strictEqual(clientSupportsFormElicitation(undefined), false);
  });
});
