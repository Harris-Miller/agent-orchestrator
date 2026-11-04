import { assert, describe, it } from '@effect/vitest';
import { Notifier, NotifyFailed, OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';
import { layerNoop } from 'effect/FileSystem';
import { layer as posixPathLayer } from 'effect/Path';

import { attentionBody, isAttentionStopReason, notifyAttention } from './notifyAttention.ts';

type Sent = { body: string; sound: boolean; title: string };

const harness = (opts: { failNotify?: boolean; focused: boolean; settings?: object }) => {
  const sent: Sent[] = [];
  const layer = Layer.mergeAll(
    Layer.succeed(Notifier, {
      isWindowFocused: Effect.succeed(opts.focused),
      notify: input => {
        sent.push({ ...input });
        return opts.failNotify === true ? Effect.fail(new NotifyFailed({ message: 'boom' })) : Effect.void;
      },
      supported: 'os',
    }),
    Layer.succeed(OS, {
      arch: () => 'arm64',
      cwd: () => '/h',
      env: () => ({}),
      homedir: () => '/h',
      platform: () => 'linux',
    }),
    layerNoop({
      exists: () => Effect.succeed(opts.settings !== undefined),
      readFileString: () => Effect.succeed(JSON.stringify(opts.settings ?? {})),
    }),
    posixPathLayer,
  );
  return { layer, sent };
};

describe('notifyAttention', () => {
  it.effect('defaults: notifies with sound when unfocused', () =>
    Effect.gen(function* () {
      const h = harness({ focused: false });
      yield* notifyAttention('Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sent, [{ body: 'Needs permission', sound: true, title: 'Chat A' }]);
    }),
  );

  it.effect('defaults: suppressed while focused', () =>
    Effect.gen(function* () {
      const h = harness({ focused: true });
      yield* notifyAttention('Chat A', { kind: 'elicitation' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sent, []);
    }),
  );

  it.effect('focused still notifies when only-unfocused is off', () =>
    Effect.gen(function* () {
      const h = harness({ focused: true, settings: { notifyOnlyWhenUnfocused: false } });
      yield* notifyAttention('Chat A', { kind: 'turn-ended', stopReason: 'end_turn' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sent, [{ body: 'Finished', sound: true, title: 'Chat A' }]);
    }),
  );

  it.effect('notifications off sends nothing', () =>
    Effect.gen(function* () {
      const h = harness({ focused: false, settings: { notificationsEnabled: false } });
      yield* notifyAttention('Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sent, []);
    }),
  );

  it.effect('sound off sends a silent notification', () =>
    Effect.gen(function* () {
      const h = harness({ focused: false, settings: { notificationSoundEnabled: false } });
      yield* notifyAttention('Chat A', { kind: 'turn-ended', stopReason: 'max_tokens' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sent, [{ body: 'Stopped: max_tokens', sound: false, title: 'Chat A' }]);
    }),
  );

  it.effect('notifier failure does not fail the effect', () =>
    Effect.gen(function* () {
      const h = harness({ failNotify: true, focused: false });
      yield* notifyAttention('Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.strictEqual(h.sent.length, 1);
    }),
  );
});

describe('attention helpers', () => {
  it('cancelled is not an Attention stop reason', () => {
    assert.isFalse(isAttentionStopReason('cancelled'));
    assert.isTrue(isAttentionStopReason('end_turn'));
    assert.isTrue(isAttentionStopReason('refusal'));
  });
  it('bodies are fixed phrases', () => {
    assert.strictEqual(attentionBody({ kind: 'elicitation' }), 'Needs input');
  });
});
