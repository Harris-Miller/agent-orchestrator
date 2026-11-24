/**
 * Session identity on Harness telemetry: one place that turns a launch target and ACP session ids into log annotations
 * (`acp.launch_target`, `acp.session.id`, `acp.session.parent_id`; keys defined in `@lib/hub/telemetryKeys`), so a log
 * line is found by label filter and its message stays a plain string. Ids and the launch target are not Private data
 * (root ADR 0002).
 */
import { ACP_LAUNCH_TARGET, ACP_PARENT_SESSION_ID, sessionAttributes } from '@lib/hub/telemetryKeys';
import { Effect } from 'effect';

/** Annotate every log of the wrapped effect with the session it belongs to (`parentSessionId` for a Spawned subagent session). */
export const annotateSessionLogs = (launchTarget: string, sessionId: string, parentSessionId?: string) =>
  Effect.annotateLogs(sessionAttributes(launchTarget, sessionId, parentSessionId));

/** Annotate every log of the wrapped effect with the launch target it concerns. */
export const annotateLaunchTargetLogs = (launchTarget: string) =>
  Effect.annotateLogs({ [ACP_LAUNCH_TARGET]: launchTarget });

/** The same for a session that has no id yet (`session/new`): launch target and, for a Spawned subagent session, its parent. */
export const annotateNewSessionLogs = (launchTarget: string, parentSessionId?: string) =>
  Effect.annotateLogs({
    [ACP_LAUNCH_TARGET]: launchTarget,
    ...(parentSessionId === undefined ? {} : { [ACP_PARENT_SESSION_ID]: parentSessionId }),
  });
