/**
 * Telemetry attribute / log annotation keys shared by the hub and the Harness, defined once. Convention: dot-separated
 * lowercase namespaces, snake_case for multiword leaves. Values are ids and closed discriminators only (root ADR 0002).
 * No Node imports: Harness WebViews import this through `@lib/hub/telemetryKeys`.
 */

/** The ACP `sessionId` of the session a signal belongs to. */
export const ACP_SESSION_ID = 'acp.session.id';
/** On a Spawned subagent session's signals: its parent's ACP `sessionId`. */
export const ACP_PARENT_SESSION_ID = 'acp.session.parent_id';
/** On a spawn span (whose `acp.session.id` is the parent's): the child's ACP `sessionId`. */
export const ACP_CHILD_SESSION_ID = 'acp.session.child_id';
/** On a forked session's `Forked ACP session` log (whose `acp.session.id` is the new session's): the session it was forked from. */
export const ACP_FORK_SOURCE_SESSION_ID = 'acp.session.fork_source_id';
/** On a forking session's span (whose `acp.session.id` is the source's): the new session's ACP `sessionId`. */
export const ACP_FORKED_SESSION_ID = 'acp.session.forked_id';
/** The Agent launch target. */
export const ACP_LAUNCH_TARGET = 'acp.launch_target';
/**
 * The app instance id (see `appSessionId` in `@lib/context-services`, which exports the same string: the context-services
 * layers cannot import this package, and `telemetryKeys.test.ts` in `@lib/ui` asserts both are equal).
 */
export const APP_SESSION_ID = 'app_session.id';

/** The kind of hub client (see `HubClientKind` in `./protocol.ts`) a signal belongs to. */
export const HUB_CLIENT_KIND = 'hub.client.kind';
/** The hub tool a call is for: one of `HUB_TOOL_NAMES`, else `unknown`. */
export const HUB_TOOL = 'hub.tool';
/** How a hub tool call ended: `ok` | `error` | `rejected` | `interrupted`. */
export const HUB_OUTCOME = 'hub.outcome';

/** Span attributes / log annotations naming a session: launch target and ACP session id, plus the parent's when a child. */
export const sessionAttributes = (
  launchTarget: string,
  sessionId: string,
  parentSessionId?: string,
): Record<string, string> => ({
  [ACP_LAUNCH_TARGET]: launchTarget,
  [ACP_SESSION_ID]: sessionId,
  ...(parentSessionId === undefined ? {} : { [ACP_PARENT_SESSION_ID]: parentSessionId }),
});
