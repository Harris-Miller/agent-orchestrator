/**
 * A Spawned subagent's outcome on its way to the parent's agent (glossary: Subagent outcome, Subagent report, Steering,
 * Prompt turn, Queued message): collected by one of the agent's own calls, or reported. Whichever hands it over first
 * wins, so it reaches the agent once.
 *
 * Reporting: the Harness never occupies the user's one Queued message slot. A report is Steering into a turn in
 * flight, or a Prompt turn of its own once the parent is idle. Reports for one parent are serialized, each holding the
 * parent until its turn has begun; a report is dropped when its parent is gone.
 */
import { annotateSessionLogs } from '../../host/sessionTelemetry.ts';
import { Deferred, Duration, Effect, Exit, Fiber, Semaphore, Stream } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';

import type { SessionRef } from '../../host/agentLaunchTarget.ts';
import { configValuesFromOptions } from '../../host/configProbe.ts';
import { sessionTurnAction } from '../../host/harnessStateTransitions.ts';
import type { HubToolResult } from '../../host/hubToolHandler.ts';
import { buildSubagentResult } from '../../host/subagentResult.ts';
import type { SubagentResultStatus } from '../../host/subagentResult.ts';

import { backendHarnessSnapshotAtom } from '../backendState.atoms.ts';
import { awaitQueuedMessageTaken, hasQueuedMessage } from '../composer.atoms.ts';
import { awaitTurnEnd, sendPromptTurn, sessionById, sessionIn, steerPromptTurn } from '../promptTurn.ts';
import { attach, claimHandle, linkOf } from './links.ts';
import type { SpawnedLink, SubagentOutcome } from './links.ts';

type Registry = AtomRegistry.AtomRegistry;

/** What the agent reads for a turn that ended without any message (a failure: there is nothing to act on). */
const NO_FINAL_MESSAGE = 'The subagent finished without producing a final message.';

const hasNoFinalMessage = (outcome: SubagentOutcome): boolean =>
  outcome.status === 'completed' && outcome.text.trim() === '';

/** The outcome as the agent reads it: a completed turn with no message is `failed` with `NO_FINAL_MESSAGE`. */
const asAgentOutcome = (outcome: SubagentOutcome): SubagentOutcome =>
  hasNoFinalMessage(outcome) ? { status: 'failed', text: NO_FINAL_MESSAGE } : outcome;

/** The child's session ref, from anything that names it (a `SpawnedLink` or `ChildMeta`). */
export const childRef = (named: Pick<ChildMeta, 'childLaunchTarget' | 'childSessionId'>): SessionRef => ({
  launchTarget: named.childLaunchTarget,
  sessionId: named.childSessionId,
});

const MAX_REPORTED_TASK_CHARS = 1000;

const truncateTask = (task: string): string =>
  task.length <= MAX_REPORTED_TASK_CHARS ? task : `${task.slice(0, MAX_REPORTED_TASK_CHARS)}…`;

/** What a Subagent result names about a child: every `SpawnedLink` has it. */
export type ChildMeta = Pick<SpawnedLink, 'childLaunchTarget' | 'childSessionId' | 'description' | 'task'>;

/** A Subagent result for the child, with its applied Config option values read from its root entry now. */
export const subagentResultText = (
  registry: Registry,
  child: ChildMeta,
  status: SubagentResultStatus,
  body: string,
): string =>
  buildSubagentResult({
    body,
    config: configValuesFromOptions(
      sessionIn(registry, child.childLaunchTarget, child.childSessionId)?.configuration ?? [],
    ),
    description: child.description,
    id: child.childSessionId,
    launchTarget: child.childLaunchTarget,
    status,
    task: truncateTask(child.task),
  });

/** The Subagent report text: one neutral shape for every provider. The task is echoed (cut when long). */
export const buildSubagentReport = (report: {
  readonly description: string;
  readonly id: string;
  readonly outcome: SubagentOutcome;
  readonly task: string;
}): string => {
  const { status, text: body } = asAgentOutcome(report.outcome);
  const task = truncateTask(report.task);
  return `<subagent-report id="${report.id}" status="${status}">\nsubagent: ${report.description}\ntask: ${task}\n\n${body}\n</subagent-report>`;
};

/**
 * The agent's own foreground call collects `outcome`: the hand-over is taken (suppressing a report not yet sent) and
 * the call's tool result (a Subagent result) returned. It always answers, even when a report already went out.
 */
export const takeOutcomeAsToolResult = (
  registry: Registry,
  child: ChildMeta,
  outcome: SubagentOutcome,
): HubToolResult => {
  claimHandle(registry, childRef(child), 'waited');
  const { status, text } = asAgentOutcome(outcome);
  return {
    isError: status !== 'completed',
    text: subagentResultText(registry, child, status, text),
  };
};

/**
 * One `wait_subagent` entry: waits up to `bound` for the link's outcome, then a running Subagent result, or the
 * collected outcome (taking the hand-over like `takeOutcomeAsToolResult`).
 */
export const awaitOutcomeEntry = (registry: Registry, link: SpawnedLink, bound: Duration.Duration) =>
  Deferred.await(link.outcome).pipe(
    Effect.timeoutOption(bound),
    Effect.map(outcome => {
      if (outcome._tag === 'None') {
        return subagentResultText(registry, link, 'running', '');
      }
      claimHandle(registry, childRef(link), 'waited');
      const { status, text } = asAgentOutcome(outcome.value);
      return subagentResultText(registry, link, status, text);
    }),
  );

/** Delivery attempts for one report before it is dropped (a Send is refused while another turn begins). */
const MAX_DELIVERY_ATTEMPTS = 5;

/** Wait after a refused Send before trying again. */
const RETRY_BACKOFF = Duration.millis(250);

/** One lock per parent, per registry. */
const parentLocksAtom = Atom.make(() => new Map<string, Semaphore.Semaphore>()).pipe(
  Atom.withLabel('subagentReportLocks'),
  Atom.keepAlive,
);

const parentLock = (registry: Registry, link: SpawnedLink): Semaphore.Semaphore => {
  const locks = registry.get(parentLocksAtom);
  const key = `${link.parentLaunchTarget}\u0000${link.parentSessionId}`;
  const existing = locks.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = Semaphore.makeUnsafe(1);
  locks.set(key, created);
  return created;
};

const parentSession = (registry: Registry, link: SpawnedLink) =>
  sessionIn(registry, link.parentLaunchTarget, link.parentSessionId);

/** The parent can still be told something: it exists, is active, and the link has not ended. */
const parentReachable = (registry: Registry, link: SpawnedLink): boolean =>
  parentSession(registry, link)?.status === 'active' && linkOf(registry, childRef(link)) !== undefined;

/** Resolves once the parent's Prompt turn is in flight (our Send began) or its fiber ended first. */
const awaitTurnBegun = (registry: Registry, link: SpawnedLink) =>
  AtomRegistry.toStream(registry, backendHarnessSnapshotAtom(link.parentLaunchTarget)).pipe(
    Stream.filter(({ sessions }) => {
      const parent = sessionById(sessions, link.parentSessionId);
      return parent === undefined || parent.pendingClientRequest === 'prompt';
    }),
    Stream.runHead,
  );

/** One delivery attempt, from whatever state the parent is in now. */
const attempt = Effect.fnUntraced(function* (
  registry: Registry,
  link: SpawnedLink,
  text: string,
  claim: () => boolean,
) {
  if (!parentReachable(registry, link)) {
    return 'dropped';
  }
  const snapshot = registry.get(backendHarnessSnapshotAtom(link.parentLaunchTarget));
  const target = { launchTarget: link.parentLaunchTarget, sessionId: link.parentSessionId };
  const session = snapshot.sessions[link.parentSessionId];
  if (session.pendingClientRequest === 'prompt') {
    // Mid-turn. Steering when the agent takes it and the turn is not waiting on the user; else wait for the turn end.
    const action = sessionTurnAction(snapshot, link.parentSessionId, {
      hasContent: true,
      steeringSupported: snapshot.agentCapabilities.steeringSupported,
    });
    if (action._tag === 'Steer') {
      if (!claim()) {
        return 'dropped';
      }
      const steered = yield* Effect.exit(steerPromptTurn(registry, { ...target, text }));
      if (Exit.isSuccess(steered)) {
        return 'delivered';
      }
    }
    yield* awaitTurnEnd(registry, link.parentLaunchTarget, link.parentSessionId);
    return 'retry';
  }
  if (hasQueuedMessage(registry, link.parentSessionId)) {
    // The user's Queued message goes first: it sends the moment it is taken, and our Send would be refused after it.
    yield* awaitQueuedMessageTaken(registry, link.parentSessionId);
    return 'retry';
  }
  if (!claim()) {
    return 'dropped';
  }
  const turn = yield* Effect.forkDetach(Effect.exit(sendPromptTurn(registry, { ...target, text })));
  const begun = yield* Effect.raceFirst(
    Effect.map(Fiber.join(turn), exit => ({ _tag: 'Ended', exit }) as const),
    Effect.as(awaitTurnBegun(registry, link), { _tag: 'Begun' } as const),
  );
  if (begun._tag === 'Begun') {
    return 'delivered';
  }
  if (Exit.isSuccess(begun.exit)) {
    return 'delivered';
  }
  // Refused (another turn is beginning): back off on the Clock so the retries do not spin.
  yield* Effect.sleep(RETRY_BACKOFF);
  return 'retry';
});

/** Deliver `text` to the link's parent, serialized with its other reports. Resolves with what happened to it. */
const deliver = (registry: Registry, link: SpawnedLink, outcome: SubagentOutcome) =>
  parentLock(registry, link).withPermits(1)(
    Effect.gen(function* () {
      const text = buildSubagentReport({
        description: link.description,
        id: link.childSessionId,
        outcome,
        task: link.task,
      });
      // The outcome is handed over at the moment of sending, so a `wait_subagent` until then suppresses the report.
      let claimed = false;
      const claim = () => {
        claimed ||= claimHandle(registry, childRef(link), 'reported');
        return claimed;
      };
      for (let attempts = 0; attempts < MAX_DELIVERY_ATTEMPTS; attempts += 1) {
        const result = yield* attempt(registry, link, text, claim);
        if (result !== 'retry') {
          return result;
        }
      }
      return 'dropped';
    }),
  );

/**
 * Once the link's outcome is in, send the parent its Subagent report, unless a `wait_subagent` already handed the
 * outcome to the agent. A report is delivered at most once, and dropped when the parent is gone.
 */
const reportWhenDone = Effect.fnUntraced(function* (registry: Registry, link: SpawnedLink) {
  const outcome = yield* Deferred.await(link.outcome);
  const result = yield* deliver(registry, link, outcome);
  if (result === 'dropped') {
    yield* Effect.logInfo('Subagent report not delivered').pipe(
      annotateSessionLogs(link.parentLaunchTarget, link.childSessionId),
    );
  }
});

/** Start reporting for a child (no-op if its link is gone or already has a reporter); it ends with the link. */
export const startReporter = Effect.fnUntraced(function* (registry: Registry, child: SessionRef) {
  const link = linkOf(registry, child);
  if (link === undefined || link.reporter !== undefined) {
    return;
  }
  const reporter = yield* Effect.forkDetach(reportWhenDone(registry, link));
  attach(registry, child, { reporter });
});
