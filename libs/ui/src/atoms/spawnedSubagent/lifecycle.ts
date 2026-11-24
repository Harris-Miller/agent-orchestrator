/**
 * Spawned subagent session core (libs/ui ADR 0011): a child the Harness starts on any usable launch target (including the parent's own) for a parent.
 * It is a root Session on its own target (so the Prompt turn machinery works) and a mirror in the parent's target's
 * `subagents`, kept equal to the root entry by a projection fiber for the link's lifetime. Work state is written by the
 * Harness at turn end.
 */
import { MAX_SUBAGENT_TEXT_CHARS } from '@lib/hub/protocol';
import type { HostServices } from '@lib/context-services';
import { Deferred, Effect, Exit, Schema, Stream } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import { ACP_CHILD_SESSION_ID, ACP_PARENT_SESSION_ID, sessionAttributes } from '@lib/hub/telemetryKeys';

import { resolveSessionCwd } from '../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget, SessionRef } from '../../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel } from '../../host/agentLaunchTarget.ts';
import { closeOnAgent } from '../../host/closeOnAgent.ts';
import type { ConfigOptionValues } from '../../host/configProbe.ts';
import {
  addChildMirror,
  addChildRowToRootEntry,
  bindSession,
  dropMirror,
  dropSession,
  markSessionInactive,
  projectChildOnto,
  setMirrorWorkState,
} from '../../host/harnessStateTransitions.ts';
import { describeError, isAcpError, RequestErrorDetail, requestErrorDetail } from '../../host/requestError.ts';
import { createSession } from '../../host/sessionRpc.ts';
import { lastAgentMessage } from '../../host/sessionUpdateReducer.ts';
import { validateSubagentConfig } from '../../host/subagentTargets.ts';

import { backendHarnessSnapshotAtom } from '../backendState.atoms.ts';
import { updateHarnessSnapshot } from '../harnessSnapshot.ts';
import { cancelPromptTurn, sendPromptTurn, sessionIn } from '../promptTurn.ts';
import type { PromptTurnResult } from '../promptTurn.ts';
import { applySessionConfigValues } from '../sessionConfigChange.ts';
import {
  allLinks,
  atMaxSpawnDepth,
  attach,
  capReached,
  childrenOf,
  end,
  linkOf,
  MAX_LIVE_CHILDREN,
  MAX_LIVE_DESCENDANTS,
  MAX_SPAWN_DEPTH,
  reserveSlot,
} from './links.ts';
import type { SpawnedLink, SubagentOutcome } from './links.ts';
import { usableSubagentTarget } from '../subagentTargets.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;

/** The tool's refusal of a spawn, naming the cause for the agent. */
export class SpawnSubagentError extends Schema.TaggedError<SpawnSubagentError>()('SpawnSubagentError', {
  detail: RequestErrorDetail,
  message: Schema.String,
}) {}

export type SpawnSubagentInput = {
  readonly configOptions: ConfigOptionValues;
  /** The mirror's name. */
  readonly description: string;
  /** The child's launch target; may be the parent's own. */
  readonly launchTarget: AgentLaunchTarget;
  readonly parent: SessionRef;
  readonly task: string;
};

export type StartedSubagent = {
  readonly childSessionId: string;
  /** Resolves once, when the child's Prompt turn ends (or the link is torn down). */
  readonly outcome: Deferred.Deferred<SubagentOutcome>;
};

const capText = (text: string): string =>
  text.length <= MAX_SUBAGENT_TEXT_CHARS
    ? text
    : `${text.slice(0, MAX_SUBAGENT_TEXT_CHARS)}\n… [truncated: the message exceeded ${MAX_SUBAGENT_TEXT_CHARS} characters]`;

const parentIsActive = (registry: Registry, parent: SessionRef): boolean => {
  return sessionIn(registry, parent.launchTarget, parent.sessionId)?.status === 'active';
};

/** Copy the child's root entry onto its mirror (no-op while either is missing or they already agree). */
const projectOnce = (registry: Registry, link: SpawnedLink): void => {
  const root = sessionIn(registry, link.childLaunchTarget, link.childSessionId);
  if (root === undefined) {
    return;
  }
  updateHarnessSnapshot(registry, link.mirrorLaunchTarget, current =>
    projectChildOnto(current, link.childSessionId, root),
  );
};

/**
 * End a link: its projection stops and it leaves the registry. The mirror stays (the transcript stays viewable) unless
 * `dropMirror`, for a child that never ran.
 */
export const endLink = Effect.fnUntraced(function* (
  registry: Registry,
  child: SessionRef,
  options: { readonly dropMirror?: true } = {},
) {
  const link = yield* end(registry, child);
  if (link === undefined) {
    return;
  }
  if (options.dropMirror === true) {
    updateHarnessSnapshot(registry, link.mirrorLaunchTarget, current => dropMirror(current, link.childSessionId));
  }
});

/**
 * Record a link's one outcome (first write wins). The winner also stamps the mirror's Work state. Synchronous, so the
 * fold can call it from Connection lost.
 */
export const settleLink = (registry: Registry, link: SpawnedLink, outcome: SubagentOutcome, stopReason?: string) => {
  // The last streamed chunks land on the mirror before its Work state does.
  projectOnce(registry, link);
  if (Deferred.isDoneUnsafe(link.outcome)) {
    return;
  }
  // Work state first: whoever awaits the outcome then reads a finished mirror.
  updateHarnessSnapshot(registry, link.mirrorLaunchTarget, current =>
    setMirrorWorkState(
      current,
      link.childSessionId,
      outcome.status === 'failed'
        ? { error: outcome.text, state: 'failed' }
        : { state: outcome.status, ...(stopReason === undefined ? {} : { stopReason }) },
    ),
  );
  Deferred.doneUnsafe(link.outcome, Effect.succeed(outcome));
};

const outcomeOfTurn = (registry: Registry, link: SpawnedLink, result: PromptTurnResult): SubagentOutcome => {
  if (result._tag === 'Rejected') {
    return { status: 'failed', text: describeError(result.error) };
  }
  if (result.stopReason === 'cancelled') {
    return { status: 'cancelled', text: 'The subagent was cancelled.' };
  }
  if (result.stopReason === 'refusal') {
    return { status: 'failed', text: 'The subagent refused the task.' };
  }
  const transcript = sessionIn(registry, link.childLaunchTarget, link.childSessionId)?.transcript;
  return {
    status: 'completed',
    text: capText((transcript === undefined ? undefined : lastAgentMessage(transcript)) ?? ''),
  };
};

/** The child's one Prompt turn, to its outcome. Never fails: a turn that cannot run is a `failed` outcome. */
const runChildTurn = Effect.fnUntraced(function* (registry: Registry, link: SpawnedLink, task: string) {
  const exit = yield* Effect.exit(
    sendPromptTurn(registry, {
      launchTarget: link.childLaunchTarget,
      notifyTurnEnd: false,
      sessionId: link.childSessionId,
      text: task,
    }),
  );
  if (Exit.isSuccess(exit)) {
    settleLink(
      registry,
      link,
      outcomeOfTurn(registry, link, exit.value),
      exit.value._tag === 'Ended' ? exit.value.stopReason : undefined,
    );
  } else {
    settleLink(registry, link, { status: 'failed', text: describeError(exit.cause) });
  }
});

/** A spawn that did not get to run: nothing of the child is left (link, mirror, root entry, History row). */
const abandonSpawn = Effect.fnUntraced(function* (registry: Registry, child: SessionRef) {
  yield* endLink(registry, child, { dropMirror: true });
  const { agentCapabilities } = registry.get(backendHarnessSnapshotAtom(child.launchTarget));
  yield* closeOnAgent(agentCapabilities, child.launchTarget, child.sessionId).pipe(Effect.ignore);
  updateHarnessSnapshot(registry, child.launchTarget, current => dropSession(current, child.sessionId));
});

/**
 * Start a Spawned subagent session. Order matters (ADR 0011): validate, create, write the link (so a racing
 * `session/list` row is already hidden), bind the root entry, create the mirror, start the projection, apply config
 * options, then prompt with the task. Everything before the prompt is undone on failure.
 */
export const startSpawnedSubagent = Effect.fn('startSpawnedSubagent')(function* (
  registry: Registry,
  input: SpawnSubagentInput,
): Effect.fn.Return<StartedSubagent, SpawnSubagentError, HostServices> {
  const { parent } = input;
  const task = input.task.trim();
  yield* Effect.annotateCurrentSpan(sessionAttributes(input.launchTarget, parent.sessionId));
  const refuse = (message: string) => new SpawnSubagentError({ message });

  if (task === '') {
    return yield* refuse('The task must not be empty.');
  }
  if (atMaxSpawnDepth(registry, parent)) {
    return yield* refuse(
      `Subagents may nest at most ${MAX_SPAWN_DEPTH} levels deep; you cannot start another subagent from here.`,
    );
  }
  const parentSnapshot = registry.get(backendHarnessSnapshotAtom(parent.launchTarget));
  if (!parentIsActive(registry, parent)) {
    return yield* refuse('The parent session is no longer active.');
  }
  const usable = usableSubagentTarget(registry, input.launchTarget);
  if (usable._tag === 'Unusable') {
    return yield* refuse(`${usable.reason}. Choose a listed launch target (see list_subagent_targets).`);
  }
  const invalid = validateSubagentConfig(usable.index, input.configOptions);
  if (invalid !== undefined) {
    return yield* refuse(invalid);
  }
  const cwd = resolveSessionCwd(
    parentSnapshot.sessions[parent.sessionId].cwd,
    parentSnapshot.sessionHistory.find(entry => entry.sessionId === parent.sessionId)?.cwd,
  );
  if (cwd === undefined) {
    return yield* refuse('The parent session has no working directory.');
  }

  // The cap check and the slot's reservation are one synchronous step: parallel spawns cannot all pass the check
  // while `createSession` runs. The slot is released as the link is written (it counts from then), or on failure.
  const slot = reserveSlot(registry, parent);
  if (slot === undefined) {
    return yield* refuse(
      capReached(registry, parent) === 'descendants'
        ? `Your session tree already has ${MAX_LIVE_DESCENDANTS} subagents running. Wait for some to finish before starting another.`
        : `You already have ${MAX_LIVE_CHILDREN} subagents running. Wait for one to finish (wait_subagent) before starting another.`,
    );
  }
  const created = yield* createSession(input.launchTarget, cwd, parent.sessionId).pipe(
    Effect.onError(() => Effect.sync(slot.release)),
    Effect.mapError(error => {
      const label = agentLaunchTargetLabel(input.launchTarget);
      // An Agent's rejection is its own text: it rides along redacted, never in the message.
      return isAcpError(error)
        ? new SpawnSubagentError({
            detail: requestErrorDetail(error),
            message: `Could not start a session on ${label}: the agent rejected it (code ${error.code})`,
          })
        : refuse(`Could not start a session on ${label}: ${describeError(error)}`);
    }),
  );
  const child = { launchTarget: input.launchTarget, sessionId: created.result.sessionId } as const;
  // The span's `acp.session.id` is the parent's: this id completes the link, so the children of a parent are findable.
  yield* Effect.annotateCurrentSpan(ACP_CHILD_SESSION_ID, child.sessionId);
  const link = slot.register({ child, description: input.description, task });
  // The hub connection can drop mid-setup (interrupting this handler): whatever was written is torn down then too.
  return yield* Effect.gen(function* () {
    if (!parentIsActive(registry, parent)) {
      yield* abandonSpawn(registry, child);
      return yield* refuse('The parent session was closed while the subagent was starting.');
    }

    updateHarnessSnapshot(registry, child.launchTarget, current => bindSession(current, created));
    // The mirror sits in the Selected session's snapshot (where its Subagent view reads); the row goes into the direct
    // parent's own root entry, which the parent's projection carries onto its mirror (ADR 0015).
    updateHarnessSnapshot(registry, link.mirrorLaunchTarget, current =>
      addChildMirror(current, {
        childId: child.sessionId,
        launchTarget: child.launchTarget,
        name: input.description,
        parentId: parent.sessionId,
        task,
      }),
    );
    updateHarnessSnapshot(registry, parent.launchTarget, current =>
      addChildRowToRootEntry(current, parent.sessionId, child.sessionId),
    );
    const projection = yield* AtomRegistry.toStream(registry, backendHarnessSnapshotAtom(child.launchTarget)).pipe(
      Stream.runForEach(() =>
        Effect.sync(() => {
          projectOnce(registry, link);
        }),
      ),
      Effect.forkDetach,
    );
    attach(registry, child, { projection });

    const configured = yield* applySessionConfigValues(registry, child, input.configOptions).pipe(
      Effect.annotateSpans(ACP_PARENT_SESSION_ID, parent.sessionId),
      Effect.annotateLogs(ACP_PARENT_SESSION_ID, parent.sessionId),
    );
    if (configured.stoppedEarly) {
      yield* abandonSpawn(registry, child);
      return yield* refuse('Could not apply the requested config options to the new subagent.');
    }

    // The turn runs in the spawn's trace, but an attribute is what a query can filter on: it ties the child's turn
    // back to the parent session (ids only), also when both run on one launch target and `acp.launch_target` is the same.
    yield* Effect.forkDetach(
      runChildTurn(registry, { ...link, projection }, task).pipe(
        Effect.annotateSpans(ACP_PARENT_SESSION_ID, parent.sessionId),
        Effect.annotateLogs(ACP_PARENT_SESSION_ID, parent.sessionId),
      ),
    );
    return { childSessionId: child.sessionId, outcome: link.outcome };
  }).pipe(
    Effect.onExit(exit =>
      Exit.isSuccess(exit) || linkOf(registry, child) === undefined ? Effect.void : abandonSpawn(registry, child),
    ),
  );
});

/** A child ends with its parent: cancelled, its turn cancelled and its session closed (never deleted), the link removed. */
const endChildWork = Effect.fnUntraced(function* (registry: Registry, link: SpawnedLink, why: string) {
  const child = { launchTarget: link.childLaunchTarget, sessionId: link.childSessionId };
  // Settled first, so the mirror reads cancelled rather than whatever the cancelled turn reports; a finished child keeps its state.
  settleLink(registry, link, { status: 'cancelled', text: why }, 'cancelled');
  yield* cancelPromptTurn(registry, child).pipe(Effect.ignore);
  const { agentCapabilities } = registry.get(backendHarnessSnapshotAtom(child.launchTarget));
  yield* closeOnAgent(agentCapabilities, child.launchTarget, child.sessionId).pipe(Effect.ignore);
  updateHarnessSnapshot(registry, child.launchTarget, current => markSessionInactive(current, child.sessionId));
  yield* endLink(registry, child);
});

const endChild = (registry: Registry, link: SpawnedLink, why: string) =>
  endChildWork(registry, link, why).pipe(
    Effect.annotateSpans(ACP_PARENT_SESSION_ID, link.parentSessionId),
    Effect.annotateLogs(ACP_PARENT_SESSION_ID, link.parentSessionId),
  );

/** The parent session was closed or deleted: every child it started ends with it. */
export const endSpawnedChildren = Effect.fnUntraced(function* (registry: Registry, parent: SessionRef) {
  for (const link of childrenOf(registry, parent)) {
    yield* endChild(registry, link, 'The parent session ended.');
  }
});

/** The parent of a Spawned subagent session while its link is live (an Attention event names it under its parent). */
export const spawnedParentOf = (registry: Registry, child: SessionRef): SessionRef | undefined => {
  const link = linkOf(registry, child);
  return link === undefined ? undefined : { launchTarget: link.parentLaunchTarget, sessionId: link.parentSessionId };
};

/** The parent's launch target lost its Backend connection: its sessions died with it, and so do their children. */
const endChildrenOfTarget = Effect.fnUntraced(function* (registry: Registry, launchTarget: AgentLaunchTarget) {
  for (const link of allLinks(registry)) {
    if (link.parentLaunchTarget === launchTarget) {
      yield* endChild(registry, link, 'The parent session ended.');
    }
  }
});

/**
 * Connection lost on `launchTarget` (the fold calls this): every child living on it has failed, and every child of a
 * parent living on it ends. Returns the work that ends the children of the lost parents.
 */
export const onLaunchTargetConnectionLost = (registry: Registry, launchTarget: AgentLaunchTarget) => {
  for (const link of allLinks(registry)) {
    if (link.childLaunchTarget === launchTarget) {
      settleLink(registry, link, {
        status: 'failed',
        text: `The connection to ${agentLaunchTargetLabel(launchTarget)} was lost.`,
      });
    }
  }
  return endChildrenOfTarget(registry, launchTarget).pipe(Effect.ignore);
};
