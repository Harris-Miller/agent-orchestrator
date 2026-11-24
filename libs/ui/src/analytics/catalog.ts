/**
 * The closed catalog of product Analytics events (root ADR 0004). The only place `makeAnalyticsEvent` is called, so an
 * event's name and properties are fixed here: each builder takes only narrow, non-free-text inputs (a launch target, a
 * count, a closed union) and sets its own allowlisted properties. Names are snake_case, `object_action`, past tense.
 * Never add a prompt, title, path, URL, id or agent text (root ADR 0002).
 */
import { makeAnalyticsEvent } from '@lib/context-services';
import type { PermissionOptionKind } from '@libs/effect-acp';

import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';

const onLaunchTarget = (name: string) => (launchTarget: AgentLaunchTarget) =>
  makeAnalyticsEvent(name, { launch_target: launchTarget });

export const appOpened = () => makeAnalyticsEvent('app_opened');

export const sessionCreated = onLaunchTarget('session_created');
export const sessionForked = onLaunchTarget('session_forked');
export const sessionArchived = onLaunchTarget('session_archived');
export const sessionUnarchived = onLaunchTarget('session_unarchived');
export const sessionRenamed = onLaunchTarget('session_renamed');
export const sessionDeleted = onLaunchTarget('session_deleted');

export const promptCancelled = onLaunchTarget('prompt_cancelled');
export const subagentCancelled = onLaunchTarget('subagent_cancelled');

/** Attachment count and launch target only, never the prompt text. */
export const promptSent = (input: { readonly attachmentCount: number; readonly launchTarget: AgentLaunchTarget }) =>
  makeAnalyticsEvent('prompt_sent', { attachment_count: input.attachmentCount, launch_target: input.launchTarget });

/** The kind of the option chosen, never its id or label. `unknown` when the option is not among the request's. */
export const permissionResponded = (optionKind: PermissionOptionKind | 'unknown') =>
  makeAnalyticsEvent('permission_responded', { option_kind: optionKind });

/** Mode and action only, never the form or its content. */
export const elicitationResponded = (input: {
  readonly action: 'accept' | 'cancel' | 'decline';
  readonly mode: 'form' | 'unknown' | 'url';
}) => makeAnalyticsEvent('elicitation_responded', { action: input.action, mode: input.mode });

export const projectTrackingStopped = () => makeAnalyticsEvent('project_tracking_stopped');
