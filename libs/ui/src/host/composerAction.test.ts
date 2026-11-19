import { assert, describe, it } from '@effect/vitest';

import type { SessionSnapshot } from './acpSessionBootstrap.ts';
import { initialSessionSnapshot } from './acpSessionBootstrap.ts';
import type { ComposerAction, ComposerSubject } from './composerAction.ts';
import { composerGates, turnAction } from './composerAction.ts';

const session = (patch: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  ...initialSessionSnapshot('s1', 'active'),
  ...patch,
});
const inFlight = (patch: Partial<SessionSnapshot> = {}) => session({ pendingClientRequest: 'prompt', ...patch });
const pendingPermission = { request: {}, resolve: () => undefined } as unknown as SessionSnapshot['pendingPermission'];
const pendingElicitation = {
  id: 'e1',
  request: {},
  resolve: () => undefined,
} as unknown as SessionSnapshot['pendingElicitation'];

const send: ComposerAction = { _tag: 'Send' };
const steer: ComposerAction = { _tag: 'Steer' };
const cancelTurn: ComposerAction = { _tag: 'CancelTurn' };
const unavailable = (reason: Extract<ComposerAction, { _tag: 'Unavailable' }>['reason']): ComposerAction => ({
  _tag: 'Unavailable',
  reason,
});

describe('turnAction', () => {
  const rows: readonly (readonly [
    string,
    SessionSnapshot | undefined,
    {
      readonly backgroundActive: boolean;
      readonly hasContent: boolean;
      readonly steeringSupported: boolean;
    },
    ComposerAction,
  ])[] = [
    [
      'idle with content → Send',
      session(),
      { backgroundActive: false, hasContent: true, steeringSupported: false },
      send,
    ],
    [
      'idle and empty → Empty',
      session(),
      { backgroundActive: false, hasContent: false, steeringSupported: true },
      unavailable('Empty'),
    ],
    [
      'config pending → Pending client request',
      session({ pendingClientRequest: 'config' }),
      { backgroundActive: false, hasContent: true, steeringSupported: true },
      unavailable('PendingClientRequest'),
    ],
    [
      'inactive → NotActive',
      session({ status: 'inactive' }),
      { backgroundActive: false, hasContent: true, steeringSupported: true },
      unavailable('NotActive'),
    ],
    [
      'missing session → NotActive',
      undefined,
      { backgroundActive: false, hasContent: true, steeringSupported: true },
      unavailable('NotActive'),
    ],
    [
      'Pending permission → PendingInteraction',
      session({ pendingPermission }),
      { backgroundActive: false, hasContent: true, steeringSupported: true },
      unavailable('PendingInteraction'),
    ],
    [
      'Pending elicitation → PendingInteraction',
      session({ pendingElicitation }),
      { backgroundActive: false, hasContent: true, steeringSupported: true },
      unavailable('PendingInteraction'),
    ],
    [
      'prompt in flight, content, Steering supported → Steer',
      inFlight(),
      { backgroundActive: false, hasContent: true, steeringSupported: true },
      steer,
    ],
    [
      'prompt in flight, empty → Prompt turn cancel',
      inFlight(),
      { backgroundActive: false, hasContent: false, steeringSupported: true },
      cancelTurn,
    ],
    [
      'prompt in flight, Steering unsupported → Prompt turn cancel',
      inFlight(),
      { backgroundActive: false, hasContent: true, steeringSupported: false },
      cancelTurn,
    ],
    [
      'prompt in flight, cancel requested → Prompt turn cancel',
      inFlight({ promptCancelRequested: true }),
      { backgroundActive: false, hasContent: true, steeringSupported: true },
      cancelTurn,
    ],
    [
      'prompt in flight, Pending interaction → Prompt turn cancel',
      inFlight({ pendingPermission }),
      { backgroundActive: false, hasContent: true, steeringSupported: true },
      cancelTurn,
    ],
    [
      'idle, empty, Background follow-up → Prompt turn cancel',
      session(),
      { backgroundActive: true, hasContent: false, steeringSupported: true },
      cancelTurn,
    ],
    [
      'idle, content, Background follow-up → Send',
      session(),
      { backgroundActive: true, hasContent: true, steeringSupported: true },
      send,
    ],
    [
      'empty, Background follow-up, Pending interaction → PendingInteraction',
      session({ pendingPermission }),
      { backgroundActive: true, hasContent: false, steeringSupported: true },
      unavailable('PendingInteraction'),
    ],
  ];
  it.each(rows)('%s', (_name, snapshot, input, expected) => {
    assert.deepStrictEqual(turnAction(snapshot, input), expected);
  });
});

describe('composerGates', () => {
  const virtual = (patch: Partial<Extract<ComposerSubject, { _tag: 'Virtual' }>> = {}): ComposerSubject => ({
    _tag: 'Virtual',
    cwd: '/proj',
    handoffInProgress: false,
    hasContent: true,
    launchTarget: 'codex-acp',
    materializing: false,
    providerPhase: 'ready',
    sendPending: false,
    ...patch,
  });
  const onSession = (
    snapshot: SessionSnapshot | undefined,
    patch: Partial<Extract<ComposerSubject, { _tag: 'Session' }>> = {},
  ): ComposerSubject => ({
    _tag: 'Session',
    backgroundActive: false,
    handoffInProgress: false,
    hasContent: true,
    session: snapshot,
    steeringSupported: true,
    ...patch,
  });

  type Gates = { readonly action: ComposerAction; readonly canEdit: boolean; readonly controlsEnabled: boolean };
  const rows: readonly (readonly [string, ComposerSubject, Gates])[] = [
    ['Virtual ready → Send', virtual(), { action: send, canEdit: true, controlsEnabled: true }],
    [
      'Virtual Send pending → SendPending, text frozen, controls open',
      virtual({ sendPending: true }),
      { action: unavailable('SendPending'), canEdit: false, controlsEnabled: true },
    ],
    [
      'Virtual under the Lifecycle lock → Locked',
      virtual({ materializing: true }),
      { action: unavailable('Locked'), canEdit: false, controlsEnabled: false },
    ],
    [
      'Virtual during a Handoff → Locked',
      virtual({ handoffInProgress: true }),
      { action: unavailable('Locked'), canEdit: false, controlsEnabled: false },
    ],
    [
      'Virtual with no launch target → NotReady',
      virtual({ launchTarget: undefined }),
      { action: unavailable('NotReady'), canEdit: true, controlsEnabled: true },
    ],
    [
      'Virtual with no cwd → NotReady',
      virtual({ cwd: undefined }),
      { action: unavailable('NotReady'), canEdit: true, controlsEnabled: true },
    ],
    [
      'Virtual on an errored provider → NotReady',
      virtual({ providerPhase: 'error' }),
      { action: unavailable('NotReady'), canEdit: true, controlsEnabled: true },
    ],
    [
      'Virtual empty → Empty',
      virtual({ hasContent: false }),
      { action: unavailable('Empty'), canEdit: true, controlsEnabled: true },
    ],
    ['Session idle → Send', onSession(session()), { action: send, canEdit: true, controlsEnabled: true }],
    [
      'Session during a Handoff → Locked',
      onSession(session(), { handoffInProgress: true }),
      { action: unavailable('Locked'), canEdit: false, controlsEnabled: false },
    ],
    [
      'Session prompt in flight during a Handoff still Steers',
      onSession(inFlight(), { handoffInProgress: true }),
      { action: steer, canEdit: false, controlsEnabled: false },
    ],
    [
      'Session prompt in flight → editable, controls closed',
      onSession(inFlight(), { hasContent: false }),
      { action: cancelTurn, canEdit: true, controlsEnabled: false },
    ],
    [
      'Session empty → Empty, controls open',
      onSession(session(), { hasContent: false }),
      { action: unavailable('Empty'), canEdit: true, controlsEnabled: true },
    ],
    [
      'Session with a Pending interaction → editable, controls closed',
      onSession(session({ pendingPermission })),
      { action: unavailable('PendingInteraction'), canEdit: true, controlsEnabled: false },
    ],
    [
      'Session inactive → not editable',
      onSession(session({ status: 'inactive' })),
      { action: unavailable('NotActive'), canEdit: false, controlsEnabled: false },
    ],
    [
      'Session empty with Background follow-up → Prompt turn cancel, controls open',
      onSession(session(), { backgroundActive: true, hasContent: false }),
      { action: cancelTurn, canEdit: true, controlsEnabled: true },
    ],
    [
      'nothing Selected → NotActive',
      onSession(undefined),
      { action: unavailable('NotActive'), canEdit: false, controlsEnabled: false },
    ],
  ];
  it.each(rows)('%s', (_name, subject, expected) => {
    const { action, canEdit, controlsEnabled } = composerGates(subject);
    assert.deepStrictEqual({ action, canEdit, controlsEnabled }, expected);
  });
});
