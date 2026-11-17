/** `session/close` as the lifecycle and Spawned subagent sessions both issue it. */
import type { AgentCapabilities } from './agentCapabilities.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { closeSession } from './sessionRpc.ts';
import { Effect } from 'effect';

/** `session/close`: fail-closed when the Agent advertises close, otherwise best-effort (it may still serve it). Never refused. */
export const closeOnAgent = (capabilities: AgentCapabilities, launchTarget: AgentLaunchTarget, sessionId: string) =>
  capabilities.sessionClose
    ? closeSession(launchTarget, sessionId)
    : Effect.asVoid(Effect.exit(closeSession(launchTarget, sessionId)));
