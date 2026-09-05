import type { AcpClientConnection } from '@libs/effect-acp';
import { Effect } from 'effect';

type NotifySessionUpdate = (update: unknown) => Effect.Effect<void>;

const agentMessage = (messageId: string, text: string) => ({
  content: { text, type: 'text' as const },
  messageId,
  sessionUpdate: 'agent_message_chunk' as const,
});

const planUpdate = (entries: { content: string; priority: string; status: string }[]) => ({
  entries,
  sessionUpdate: 'plan' as const,
});

const ELICITATION_SCHEMA = {
  properties: {
    notes: {
      description: 'Optional notes for the agent',
      title: 'Notes',
      type: 'string' as const,
    },
    strategy: {
      description: 'How aggressively to refactor',
      enum: ['conservative', 'balanced', 'aggressive'],
      title: 'Strategy',
      type: 'string' as const,
    },
  },
  required: ['strategy'],
  type: 'object' as const,
};

export const runElicitationFormScenario = Effect.fn('runElicitationFormScenario')(function* (
  client: AcpClientConnection,
  sessionId: string,
  formSupported: boolean,
  notifySessionUpdate: NotifySessionUpdate,
) {
  yield* notifySessionUpdate(agentMessage('msg_elicit_pre', 'I need a preference before continuing.'));

  if (!formSupported) {
    yield* notifySessionUpdate(
      agentMessage(
        'msg_elicit_unsupported',
        'Form elicitation is not advertised by this Client; falling back without asking.',
      ),
    );
    yield* notifySessionUpdate(
      planUpdate([{ content: 'Continue without user form input', priority: 'medium', status: 'completed' }]),
    );
    return;
  }

  const result = yield* client['elicitation/create']({
    message: 'How should I approach this refactoring?',
    mode: 'form',
    requestedSchema: ELICITATION_SCHEMA,
    sessionId,
  }).pipe(Effect.orDie);

  if (result.action === 'accept') {
    const strategy =
      result.content !== undefined && result.content !== null && typeof result.content.strategy === 'string'
        ? result.content.strategy
        : 'unspecified';
    const notes =
      result.content !== undefined && result.content !== null && typeof result.content.notes === 'string'
        ? result.content.notes
        : '';

    yield* notifySessionUpdate(
      agentMessage(
        'msg_elicit_accept',
        `Proceeding with strategy=${strategy}${notes.length > 0 ? ` (notes: ${notes})` : ''}.`,
      ),
    );
    yield* notifySessionUpdate(
      planUpdate([
        { content: 'Collect user preference', priority: 'high', status: 'completed' },
        { content: 'Apply chosen strategy', priority: 'high', status: 'in_progress' },
      ]),
    );
    yield* notifySessionUpdate({
      kind: 'read',
      sessionUpdate: 'tool_call',
      status: 'pending',
      title: 'Inspect target files',
      toolCallId: 'call_elicit_1',
    });
    yield* notifySessionUpdate({
      sessionUpdate: 'tool_call_update',
      status: 'completed',
      toolCallId: 'call_elicit_1',
    });
    yield* notifySessionUpdate(
      planUpdate([
        { content: 'Collect user preference', priority: 'high', status: 'completed' },
        { content: 'Apply chosen strategy', priority: 'high', status: 'completed' },
      ]),
    );
    yield* notifySessionUpdate(agentMessage('msg_elicit_done', 'Refactor plan applied based on your answers.'));
    return;
  }

  yield* notifySessionUpdate(
    agentMessage('msg_elicit_blocked', `Elicitation ${result.action}; cannot continue without preference.`),
  );
  yield* notifySessionUpdate(planUpdate([{ content: 'Blocked on user input', priority: 'high', status: 'pending' }]));
});

export const runElicitationNoCapScenario = Effect.fn('runElicitationNoCapScenario')(function* (
  _client: AcpClientConnection,
  _sessionId: string,
  notifySessionUpdate: NotifySessionUpdate,
) {
  yield* notifySessionUpdate(
    agentMessage(
      'msg_elicit_no_cap',
      'This fixture always takes the unsupported-capability path (no elicitation/create).',
    ),
  );
  yield* notifySessionUpdate(
    planUpdate([
      { content: 'Skip elicitation; Client capability absent or ignored', priority: 'medium', status: 'completed' },
    ]),
  );
});

export const runPermissionToolScenario = Effect.fn('runPermissionToolScenario')(function* (
  client: AcpClientConnection,
  sessionId: string,
  notifySessionUpdate: NotifySessionUpdate,
) {
  yield* notifySessionUpdate(agentMessage('msg_perm_pre', 'I need permission before reading the config file.'));
  yield* notifySessionUpdate({
    kind: 'read',
    sessionUpdate: 'tool_call',
    status: 'pending',
    title: 'Reading configuration file',
    toolCallId: 'call_perm_1',
  });

  const permission = yield* client['session/request_permission']({
    options: [
      { kind: 'allow_once', name: 'Allow once', optionId: 'allow-once' },
      { kind: 'allow_always', name: 'Allow always', optionId: 'allow-always' },
      { kind: 'reject_once', name: 'Reject', optionId: 'reject-once' },
      { kind: 'reject_always', name: 'Reject always', optionId: 'reject-always' },
    ],
    sessionId,
    toolCall: {
      toolCallId: 'call_perm_1',
    },
  }).pipe(Effect.orDie);

  const { outcome } = permission;
  if (outcome.outcome === 'cancelled') {
    yield* notifySessionUpdate({
      sessionUpdate: 'tool_call_update',
      status: 'failed',
      toolCallId: 'call_perm_1',
    });
    yield* notifySessionUpdate(agentMessage('msg_perm_cancelled', 'Permission request cancelled.'));
    yield* notifySessionUpdate(planUpdate([{ content: 'Blocked on user input', priority: 'high', status: 'pending' }]));
    return;
  }

  const allowed = outcome.optionId === 'allow-once' || outcome.optionId === 'allow-always';
  if (allowed) {
    yield* notifySessionUpdate({
      sessionUpdate: 'tool_call_update',
      status: 'completed',
      toolCallId: 'call_perm_1',
    });
    yield* notifySessionUpdate(
      planUpdate([
        { content: 'Request permission', priority: 'high', status: 'completed' },
        { content: 'Read configuration', priority: 'high', status: 'completed' },
      ]),
    );
    yield* notifySessionUpdate(agentMessage('msg_perm_allowed', `Permission granted (${outcome.optionId}).`));
    return;
  }

  yield* notifySessionUpdate({
    sessionUpdate: 'tool_call_update',
    status: 'failed',
    toolCallId: 'call_perm_1',
  });
  yield* notifySessionUpdate(agentMessage('msg_perm_rejected', `Permission rejected (${outcome.optionId}).`));
  yield* notifySessionUpdate(planUpdate([{ content: 'Blocked on user input', priority: 'high', status: 'pending' }]));
});
