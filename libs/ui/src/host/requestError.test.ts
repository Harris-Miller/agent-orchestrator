import { assert, describe, it } from '@effect/vitest';
import { AcpError } from '@libs/effect-acp';
import { Cause, Schema } from 'effect';

import { acpErrorOfCause, describeError, isAcpError, RequestErrorDetail, requestErrorDetail } from './requestError.ts';

class QuotingError extends Schema.TaggedError<QuotingError>()('QuotingError', {
  detail: RequestErrorDetail,
  message: Schema.String,
}) {}

/** As decoded off the wire: the Agent's text is `Redacted`. */
const rejection = Schema.decodeUnknownSync(AcpError)({
  code: -32603,
  data: { details: 'limit is 100000' },
  message: 'Exceeds max character length',
});

describe('isAcpError', () => {
  it('accepts a JSON-RPC error response, with or without data', () => {
    assert.isTrue(isAcpError(rejection));
    assert.isTrue(isAcpError(Schema.decodeUnknownSync(AcpError)({ code: -32000, message: 'auth_required' })));
  });

  it('rejects transport failures, undecoded wire errors and anything without a numeric code', () => {
    assert.isFalse(isAcpError({ code: -32000, message: 'auth_required' }));
    assert.isFalse(isAcpError(new Error('boom')));
    assert.isFalse(isAcpError({ _tag: 'BackendNotConnected', launchTarget: 'codex-acp' }));
    assert.isFalse(isAcpError({ code: 'ENOENT', message: 'missing' }));
    assert.isFalse(isAcpError('prompt-fail'));
    assert.isFalse(isAcpError(undefined));
  });
});

describe('acpErrorOfCause', () => {
  it('finds the response whether it failed or died', () => {
    assert.deepStrictEqual(acpErrorOfCause(Cause.fail(rejection)), rejection);
    assert.deepStrictEqual(acpErrorOfCause(Cause.die(rejection)), rejection);
  });

  it('is undefined for any other cause', () => {
    assert.isUndefined(acpErrorOfCause(Cause.fail('prompt-fail')));
    assert.isUndefined(acpErrorOfCause(Cause.interrupt()));
  });
});

describe('describeError', () => {
  it('reads an Error by its message', () => {
    assert.strictEqual(describeError(new Error('boom')), 'boom');
  });

  it('joins an agent response with its details', () => {
    assert.strictEqual(describeError(rejection), 'Exceeds max character length: limit is 100000');
  });

  it('uses the message alone when there are no details', () => {
    assert.strictEqual(describeError({ code: 1, message: 'nope' }), 'nope');
    assert.strictEqual(describeError({ code: 1, data: { details: 3 }, message: 'nope' }), 'nope');
  });

  it('reads the details of any object that has them, numeric code or not', () => {
    assert.strictEqual(describeError({ data: { details: 'why' }, message: 'nope' }), 'nope: why');
  });

  it('never prints an object as [object Object]', () => {
    assert.strictEqual(describeError({ code: 1 }), '{"code":1}');
    assert.strictEqual(describeError('plain'), 'plain');
    assert.strictEqual(describeError(42), '42');
  });
});

describe('RequestErrorDetail', () => {
  it('shows the Agent text to the user but keeps it out of the message, the cause and JSON', () => {
    const error = new QuotingError({ detail: requestErrorDetail(rejection), message: 'The agent rejected it' });
    assert.strictEqual(describeError(error), 'The agent rejected it: Exceeds max character length: limit is 100000');
    assert.notInclude(error.message, 'Exceeds');
    assert.notInclude(Cause.pretty(Cause.fail(error)), 'Exceeds');
    assert.notInclude(JSON.stringify(error), 'Exceeds');
  });
});
