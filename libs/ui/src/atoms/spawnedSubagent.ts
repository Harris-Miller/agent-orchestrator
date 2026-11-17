/**
 * Spawned subagent session core (libs/ui ADR 0011): a child the Harness starts on another launch target for a parent.
 * It is a root Session on its own target (so the Prompt turn machinery works) and a mirror in the parent's target's
 * `subagents`, kept equal to the root entry by a projection fiber for the link's lifetime. Work state is written by the
 * Harness at turn end.
 */
import { MAX_SUBAGENT_TEXT_CHARS } from '@lib/hub/protocol';
import type { HostServices } from '@lib/context-services';
import { Deferred, Effect, Exit, Fiber, Schema, Stream } from 'effect';
import { AtomRegistry } from 'effect/reactivity';

import { resolveSessionCwd } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { agentLaunchTargetLabel } from '../host/agentLaunchTarget.ts';
import { closeOnAgent } from '../host/closeOnAgent.ts';
import type { ConfigOptionValues } from '../host/configProbe.ts';
import {
  bindSession,
  dropMirror,
  dropSession,
  mirrorChildIntoParent,
  projectChildOnto,
  setMirrorWorkState,
} from '../host/harnessStateTransitions.ts';
import { describeError } from '../host/requestError.ts';
import { createSession } from '../host/sessionRpc.ts';
import { lastAgentMessage } from '../host/sessionUpdateReducer.ts';
import { addLink, linkOfChild, removeLink, updateLink } from '../host/subagentLinks.ts';
import type { SpawnedLink, SubagentOutcome } from '../host/subagentLinks.ts';
import { validateSubagentConfig } from '../host/subagentTargets.ts';

import { backendHarnessSnapshotAtom } from './backendState.atoms.ts';
import { updateHarnessSnapshot } from './harnessSnapshot.ts';
import { sendPromptTurn } from './promptTurn.ts';
import type { PromptTurnResult } from './promptTurn.ts';
import { applySessionConfigValues } from './sessionConfigChange.ts';
import { spawnedLinksAtom } from './subagentLinks.atoms.ts';
import { usableSubagentTarget } from './subagentTargets.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;
type SessionRef = { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string };

/** The tool's refusal of a spawn, naming the cause for the agent. */
export class SpawnSubagentError extends Schema.TaggedError<SpawnSubagentError>()('SpawnSubagentError', {
  message: Schema.String,
}) {}

export type SpawnSubagentInput = {
  readonly configOptions: ConfigOptionValues;
  /** The mirror's name. */
  readonly description: string;
  /** The child's launch target; never the parent's own. */
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
  const { sessions } = registry.get(backendHarnessSnapshotAtom(parent.launchTarget));
  return parent.sessionId in sessions && sessions[parent.sessionId].status === 'active';
};

/** Copy the child's root entry onto its mirror (no-op while either is missing or they already agree). */
const projectOnce = (registry: Registry, link: SpawnedLink): void => {
  const { sessions } = registry.get(backendHarnessSnapshotAtom(link.childLaunchTarget));
  if (!(link.childSessionId in sessions)) {
    return;
  }
  const root = sessions[link.childSessionId];
  updateHarnessSnapshot(registry, link.parentLaunchTarget, current =>
    projectChildOnto(current, link.childSessionId, root),
  );
};

const stopProjection = (link: SpawnedLink | undefined) =>
  link?.projection === undefined ? Effect.void : Fiber.interrupt(link.projection);

/**
 * End a link: its projection stops and it leaves the registry. The mirror stays (the transcript stays viewable) unless
 * `dropMirror`, for a child that never ran.
 */
export const endLink = Effect.fnUntraced(function* (
  registry: Registry,
  child: SessionRef,
  options: { readonly dropMirror?: true } = {},
) {
  const link = linkOfChild(registry.get(spawnedLinksAtom), child.launchTarget, child.sessionId);
  if (link === undefined) {
    return;
  }
  registry.update(spawnedLinksAtom, links => removeLink(links, child.launchTarget, child.sessionId));
  yield* stopProjection(link);
  if (link.reporter !== undefined) {
    yield* Fiber.interrupt(link.reporter);
  }
  if (options.dropMirror === true) {
    updateHarnessSnapshot(registry, link.parentLaunchTarget, current => dropMirror(current, link.childSessionId));
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
  updateHarnessSnapshot(registry, link.parentLaunchTarget, current =>
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
  const { sessions } = registry.get(backendHarnessSnapshotAtom(link.childLaunchTarget));
  const transcript = link.childSessionId in sessions ? sessions[link.childSessionId].transcript : undefined;
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
  yield* Effect.annotateCurrentSpan({ 'acp.agent': input.launchTarget, 'acp.sessionId': parent.sessionId });
  const refuse = (message: string) => new SpawnSubagentError({ message });

  if (input.launchTarget === parent.launchTarget) {
    return yield* refuse(
      'spawn_subagent starts a subagent on a different launch target than your own. Use your own subagent tool for work on your own provider.',
    );
  }
  if (task === '') {
    return yield* refuse('The task must not be empty.');
  }
  const parentSnapshot = registry.get(backendHarnessSnapshotAtom(parent.launchTarget));
  if (!parentIsActive(registry, parent)) {
    return yield* refuse('The parent session is no longer active.');
  }
  const usable = usableSubagentTarget(registry, input.launchTarget);
  if (usable._tag === 'Unusable') {
    return yield* refuse(`${usable.reason}. Choose another launch target (see list_subagent_targets).`);
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

  const created = yield* createSession(input.launchTarget, cwd).pipe(
    Effect.mapError(error =>
      refuse(`Could not start a session on ${agentLaunchTargetLabel(input.launchTarget)}: ${describeError(error)}`),
    ),
  );
  const child = { launchTarget: input.launchTarget, sessionId: created.result.sessionId } as const;
  const link: SpawnedLink = {
    childLaunchTarget: child.launchTarget,
    childSessionId: child.sessionId,
    description: input.description,
    handleState: 'open',
    outcome: Deferred.makeUnsafe<SubagentOutcome>(),
    parentLaunchTarget: parent.launchTarget,
    parentSessionId: parent.sessionId,
    task,
  };
  registry.update(spawnedLinksAtom, links => addLink(links, link));
  if (!parentIsActive(registry, parent)) {
    yield* abandonSpawn(registry, child);
    return yield* refuse('The parent session was closed while the subagent was starting.');
  }

  updateHarnessSnapshot(registry, child.launchTarget, current => bindSession(current, created));
  updateHarnessSnapshot(registry, parent.launchTarget, current =>
    mirrorChildIntoParent(current, {
      childId: child.sessionId,
      launchTarget: child.launchTarget,
      name: input.description,
      parentId: parent.sessionId,
      task,
    }),
  );
  const projection = yield* AtomRegistry.toStream(registry, backendHarnessSnapshotAtom(child.launchTarget)).pipe(
    Stream.runForEach(() => Effect.sync(() => projectOnce(registry, link))),
    Effect.forkDetach,
  );
  registry.update(spawnedLinksAtom, links => updateLink(links, child.launchTarget, child.sessionId, { projection }));

  const configured = yield* applySessionConfigValues(registry, child, input.configOptions);
  if (configured.stoppedEarly) {
    yield* abandonSpawn(registry, child);
    return yield* refuse('Could not apply the requested config options to the new subagent.');
  }

  yield* Effect.forkDetach(runChildTurn(registry, { ...link, projection }, task));
  return { childSessionId: child.sessionId, outcome: link.outcome };
});

/** Child target Connection lost: every child living on it has failed (the fold calls this). */
export const failLinksOnConnectionLost = (registry: Registry, launchTarget: AgentLaunchTarget): void => {
  for (const link of registry.get(spawnedLinksAtom).values()) {
    if (link.childLaunchTarget === launchTarget) {
      settleLink(registry, link, {
        status: 'failed',
        text: `The connection to ${agentLaunchTargetLabel(launchTarget)} was lost.`,
      });
    }
  }
};
