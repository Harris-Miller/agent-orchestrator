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
 * The app instance id (see `appSessionId` in `@lib/context-services`).
 */
export const APP_SESSION_ID = 'app_session.id';

/** The OS process id of a spawned process (the ACP agent, the hub). */
export const PROCESS_PID = 'process.pid';
/** The unique id of one running service instance (OTLP resource attribute). */
export const SERVICE_INSTANCE_ID = 'service.instance.id';
/** Which build a signal comes from (OTLP resource attribute): `dev` or a release target. */
export const BUILD_TARGET = 'build.target';
/** The code module a log comes from. */
export const CODE_NAMESPACE = 'code.namespace';
/** The `_tag` of the failure a log describes. */
export const FAILURE_TAG = 'failure.tag';
/** The closed reason a step was not taken or retried. */
export const FAILURE_REASON = 'failure.reason';
/** How many attempts a retrying step makes before giving up. */
export const RETRY_MAX_ATTEMPTS = 'retry.max_attempts';
/** How long something took, in milliseconds. */
export const DURATION_MS = 'duration.ms';
/** The version of the ACP adapter an Agent launch target resolved to. */
export const ACP_ADAPTER_VERSION = 'acp.adapter.version';
/** How a session was reopened: `resume` or `load`. */
export const ACP_SESSION_LOAD_MODE = 'acp.session.load_mode';
/** Length in characters of the handoff prompt text. */
export const HANDOFF_PROMPT_CHARS = 'handoff.prompt_chars';
/** The Agent launch target a handoff is going to. */
export const HANDOFF_TARGET_LAUNCH_TARGET = 'handoff.target_launch_target';
/** The ACP `sessionId` a handoff is from. */
export const HANDOFF_SOURCE_SESSION_ID = 'handoff.source_session_id';

/** The name of an executable looked up on PATH. */
export const EXECUTABLE_NAME = 'executable.name';
/** The resolved path of an executable (private: always `Redacted`). */
export const EXECUTABLE_PATH = 'executable.path';
/** The exit code of a finished process. */
export const PROCESS_EXIT_CODE = 'process.exit_code';
/** The stderr of a finished process (private: always `Redacted`). */
export const PROCESS_STDERR = 'process.stderr';
/** The port the hub listens on. */
export const HUB_PORT = 'hub.port';
/** Which config probe step a log is about. */
export const CONFIG_PROBE_STEP = 'config_probe.step';
/** How a `_session/steering` request ended. */
export const STEERING_OUTCOME = 'steering.outcome';

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
