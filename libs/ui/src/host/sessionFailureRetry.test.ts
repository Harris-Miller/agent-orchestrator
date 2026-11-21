import { assert, describe, it } from '@effect/vitest';
import { Option } from 'effect';

import { canContinueFailure, retryableUserMessage } from './sessionFailureRetry.ts';
import type { ChatItem } from './sessionUpdateReducer.ts';

const user = (id: string): ChatItem => ({ id, kind: 'user_message', text: id });
const failure = (id: string): ChatItem => ({
  actions: ['retry'],
  category: 'c',
  id,
  kind: 'session_failure',
  revision: 1,
  severity: 'error',
  title: 't',
});
const idle = { pendingClientRequest: undefined, status: 'active' };

describe('retryableUserMessage', () => {
  it('returns the last user message for the latest failure after it', () => {
    const items = [user('u1'), failure('f1')];
    assert.deepStrictEqual(
      Option.map(retryableUserMessage(idle, items, 'f1'), m => m.id),
      Option.some('u1'),
    );
  });

  it('none for a failure row before a later user message', () => {
    const items = [user('u1'), failure('f1'), user('u2')];
    assert.isTrue(Option.isNone(retryableUserMessage(idle, items, 'f1')));
  });

  it('none when not the latest failure row', () => {
    const items = [user('u1'), failure('f1'), failure('f2')];
    assert.isTrue(Option.isNone(retryableUserMessage(idle, items, 'f1')));
    assert.isTrue(Option.isSome(retryableUserMessage(idle, items, 'f2')));
  });

  it('none when the last user message has images', () => {
    const withImages: ChatItem = { id: 'u1', images: [{ mimeType: 'image/png' }], kind: 'user_message', text: 'u1' };
    assert.isTrue(Option.isNone(retryableUserMessage(idle, [withImages, failure('f1')], 'f1')));
  });

  it('none while a turn or request is in flight', () => {
    const items = [user('u1'), failure('f1')];
    assert.isTrue(Option.isNone(retryableUserMessage({ ...idle, status: 'inactive' }, items, 'f1')));
    assert.isTrue(Option.isNone(retryableUserMessage({ ...idle, pendingClientRequest: 'prompt' }, items, 'f1')));
  });

  it('none without any user message', () => {
    assert.isTrue(Option.isNone(retryableUserMessage(idle, [failure('f1')], 'f1')));
  });
});

describe('canContinueFailure', () => {
  const limit = (id: string, overrides: Partial<Extract<ChatItem, { kind: 'session_failure' }>> = {}): ChatItem => ({
    actions: ['retry'],
    category: 'limit',
    id,
    kind: 'session_failure',
    revision: 1,
    severity: 'error',
    title: 't',
    ...overrides,
  });

  it('true for a limit failure offering retry', () => {
    assert.isTrue(canContinueFailure(idle, [user('u1'), limit('f1')], 'f1'));
  });

  it('false for non-limit, or without a retry action', () => {
    assert.isFalse(canContinueFailure(idle, [user('u1'), failure('f1')], 'f1'));
    assert.isFalse(canContinueFailure(idle, [user('u1'), limit('f1', { actions: ['new_session'] })], 'f1'));
  });

  it('false for a superseded or replayed row', () => {
    assert.isFalse(canContinueFailure(idle, [user('u1'), limit('f1'), user('u2')], 'f1'));
    assert.isFalse(canContinueFailure(idle, [user('u1'), limit('f1'), limit('f2')], 'f1'));
    assert.isFalse(canContinueFailure(idle, [user('u1')], 'missing'));
  });

  it('false while a turn or request is in flight', () => {
    const items = [user('u1'), limit('f1')];
    assert.isFalse(canContinueFailure({ ...idle, status: 'inactive' }, items, 'f1'));
    assert.isFalse(canContinueFailure({ ...idle, pendingClientRequest: 'prompt' }, items, 'f1'));
  });

  it('true even when the last user message has images, or there is none', () => {
    const withImages: ChatItem = { id: 'u1', images: [{ mimeType: 'image/png' }], kind: 'user_message', text: 'u1' };
    assert.isTrue(canContinueFailure(idle, [withImages, limit('f1')], 'f1'));
    assert.isTrue(canContinueFailure(idle, [limit('f1')], 'f1'));
  });
});
