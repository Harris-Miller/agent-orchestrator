import { assert, describe, it } from '@effect/vitest';
import type { UserSettings } from '@lib/hoa-home';
import { Notifier, NotifyFailed } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import { initialBackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import { initialSpawnedSubagentSnapshot } from './subagent.ts';
import { attentionBody, isAttentionStopReason, notifyAttention, notifySessionAttention } from './notifyAttention.ts';

type Sent = { body: string; sound: boolean; title: string };

const harness = (opts: {
  failNotify?: boolean;
  failSound?: boolean;
  focused: boolean;
  inApp?: boolean;
  settings?: UserSettings;
}) => {
  const sent: Sent[] = [];
  const sounds: string[] = [];
  const layer = Layer.succeed(Notifier, {
    isWindowFocused: Effect.succeed(opts.focused),
    notify: input => {
      sent.push({ ...input });
      return opts.failNotify === true ? Effect.fail(new NotifyFailed({ message: 'boom' })) : Effect.void;
    },
    playSound: Effect.suspend(() => {
      sounds.push('chime');
      return opts.failSound === true ? Effect.fail(new NotifyFailed({ message: 'blocked' })) : Effect.void;
    }),
    supported: opts.inApp === true ? 'in-app' : 'os',
  });
  return { layer, sent, sounds, settings: opts.settings ?? {} };
};

describe('notifyAttention', () => {
  it.effect('defaults: silent notification plus in-app sound when unfocused', () =>
    Effect.gen(function* () {
      const h = harness({ focused: false });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sent, [{ body: 'Needs permission', sound: false, title: 'Chat A' }]);
      assert.deepStrictEqual(h.sounds, ['chime']);
    }),
  );

  it.effect('defaults: suppressed while focused', () =>
    Effect.gen(function* () {
      const h = harness({ focused: true });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'elicitation' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sent, []);
    }),
  );

  it.effect('focused still notifies when only-unfocused is off', () =>
    Effect.gen(function* () {
      const h = harness({ focused: true, settings: { notifyOnlyWhenUnfocused: false } });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'turn-ended', stopReason: 'end_turn' }).pipe(
        Effect.provide(h.layer),
      );
      assert.deepStrictEqual(h.sent, [{ body: 'Finished', sound: false, title: 'Chat A' }]);
    }),
  );

  it.effect('in-app notifier ignores the unfocused gate', () =>
    Effect.gen(function* () {
      const h = harness({ focused: true, inApp: true });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.strictEqual(h.sent.length, 1);
    }),
  );

  it.effect('notifications on + sound on: one silent notification and the in-app sound', () =>
    Effect.gen(function* () {
      const h = harness({ focused: false });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sent, [{ body: 'Needs permission', sound: false, title: 'Chat A' }]);
      assert.deepStrictEqual(h.sounds, ['chime']);
    }),
  );

  it.effect('notifications off + sound on: sound only', () =>
    Effect.gen(function* () {
      const h = harness({ focused: false, settings: { notificationsEnabled: false } });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sent, []);
      assert.deepStrictEqual(h.sounds, ['chime']);
    }),
  );

  it.effect('notifications off + sound off: nothing', () =>
    Effect.gen(function* () {
      const h = harness({
        focused: false,
        settings: { notificationsEnabled: false, notificationSoundEnabled: false },
      });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sent, []);
      assert.deepStrictEqual(h.sounds, []);
    }),
  );

  it.effect('sound only is suppressed while focused', () =>
    Effect.gen(function* () {
      const h = harness({ focused: true, settings: { notificationsEnabled: false } });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sounds, []);
    }),
  );

  it.effect('sound only plays while focused when only-unfocused is off', () =>
    Effect.gen(function* () {
      const h = harness({ focused: true, settings: { notificationsEnabled: false, notifyOnlyWhenUnfocused: false } });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sounds, ['chime']);
    }),
  );

  it.effect('sound failure does not fail the effect or skip the notification', () =>
    Effect.gen(function* () {
      const h = harness({ failSound: true, focused: false });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sounds, ['chime']);
      assert.strictEqual(h.sent.length, 1);
    }),
  );

  it.effect('notifications on + sound off: one silent notification, no standalone sound', () =>
    Effect.gen(function* () {
      const h = harness({ focused: false, settings: { notificationSoundEnabled: false } });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
      assert.deepStrictEqual(h.sent, [{ body: 'Needs permission', sound: false, title: 'Chat A' }]);
      assert.deepStrictEqual(h.sounds, []);
    }),
  );

  it.effect('sound off sends a silent notification', () =>
    Effect.gen(function* () {
      const h = harness({ focused: false, settings: { notificationSoundEnabled: false } });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'turn-ended', stopReason: 'max_tokens' }).pipe(
        Effect.provide(h.layer),
      );
      assert.deepStrictEqual(h.sent, [{ body: 'Stopped: max_tokens', sound: false, title: 'Chat A' }]);
    }),
  );

  it.effect('notifier failure does not fail the effect', () =>
    Effect.gen(function* () {
      const h = harness({ failNotify: true, focused: false });
      yield* notifyAttention(h.settings, 'Chat A', { kind: 'permission' }).pipe(Effect.provide(h.layer));
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

describe('notifySessionAttention titles (nested subagents)', () => {
  it.effect('names a child under its direct parent: the chat title, else the parent subagent name', () =>
    Effect.gen(function* () {
      const h = harness({ focused: false });
      const snapshot = {
        ...initialBackendHarnessSnapshot(),
        sessionHistory: [{ cwd: '/w', sessionId: 'root', title: 'Root chat' }],
        subagents: {
          child: { ...initialSpawnedSubagentSnapshot('child', 'root', 'codex-acp'), name: 'Reviewer' },
          grandchild: { ...initialSpawnedSubagentSnapshot('grandchild', 'child', 'codex-acp'), name: 'Linter' },
        },
      };
      for (const id of ['child', 'grandchild']) {
        yield* notifySessionAttention(h.settings, snapshot, 'codex-acp', id, { kind: 'permission' }).pipe(
          Effect.provide(h.layer),
        );
      }
      assert.deepStrictEqual(
        h.sent.map(entry => entry.title),
        ['Root chat · Reviewer', 'Reviewer · Linter'],
      );
    }),
  );
});
