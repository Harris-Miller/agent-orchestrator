import { assert, describe, it } from '@effect/vitest';
import { Option, Schema } from 'effect';

import { SessionFailure } from './sessionFailure.ts';

const decode = Schema.decodeUnknownOption(SessionFailure);

const full = {
  actions: ['retry', 'login'],
  category: 'connection',
  details: 'ECONNRESET',
  id: 'f1',
  reason: 'attempt 1 of 3',
  revision: 1,
  severity: 'warning',
  title: 'Reconnecting',
};

describe('SessionFailure', () => {
  it('decodes full and minimal payloads', () => {
    assert.isTrue(Option.isSome(decode(full)));
    assert.isTrue(
      Option.isSome(decode({ actions: [], category: 'unknown', id: 'f1', revision: 0, severity: 'error', title: 't' })),
    );
  });

  it('tolerates unknown category, severity, actions and extra fields', () => {
    assert.isTrue(
      Option.isSome(decode({ ...full, actions: ['teleport'], category: 'weather', extra: 1, severity: 'doom' })),
    );
  });

  it('rejects empty id, non-integer revision and missing title', () => {
    assert.isTrue(Option.isNone(decode({ ...full, id: '' })));
    assert.isTrue(Option.isNone(decode({ ...full, revision: 1.5 })));
    const { title: _title, ...noTitle } = full;
    assert.isTrue(Option.isNone(decode(noTitle)));
  });
});
