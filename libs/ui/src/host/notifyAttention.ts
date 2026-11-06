import { readUserSettings } from '@lib/ao-home';
import { Notifier } from '@lib/context-services';
import type { StopReason } from '@libs/effect-acp';
import { Effect } from 'effect';

import {
  notificationsEnabled,
  notificationSoundEnabled,
  notifyOnlyWhenUnfocusedEnabled,
} from '../atoms/userSettings/userSettings.atoms.ts';

import type { BackendHarnessSnapshot } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { sessionChatTitle } from './sessionChatTitle.ts';
import { getSubagent, rootAncestorId } from './subagent.ts';

/** A moment the user should notice (see ui GLOSSARY Attention event). */
export type AttentionEvent =
  | { readonly kind: 'elicitation' }
  | { readonly kind: 'permission' }
  | { readonly kind: 'turn-ended'; readonly stopReason: StopReason };

/** Fixed phrase per event. Never agent text. */
export const attentionBody = (event: AttentionEvent): string => {
  switch (event.kind) {
    case 'elicitation':
      return 'Needs input';
    case 'permission':
      return 'Needs permission';
    case 'turn-ended':
      return event.stopReason === 'end_turn' ? 'Finished' : `Stopped: ${event.stopReason}`;
  }
};

/** Whether a turn ending with this stop reason is an Attention event. */
export const isAttentionStopReason = (stopReason: StopReason): boolean => stopReason !== 'cancelled';

/**
 * Raise a Notification for an Attention event, honoring User settings. Never fails:
 * settings read, focus probe and notify errors are swallowed so a turn is never affected.
 */
export const notifyAttention = (title: string, event: AttentionEvent) =>
  Effect.gen(function* () {
    const settings = yield* readUserSettings();
    if (!notificationsEnabled(settings)) {
      return;
    }
    const notifier = yield* Notifier;
    // An in-app message is only visible in a focused window, so the unfocused gate cannot apply to it.
    if (notifier.supported === 'os' && notifyOnlyWhenUnfocusedEnabled(settings) && (yield* notifier.isWindowFocused)) {
      return;
    }
    yield* notifier.notify({
      body: attentionBody(event),
      sound: notificationSoundEnabled(settings),
      title,
    });
  }).pipe(Effect.ignore);

/** {@link notifyAttention} titled with the session's chat title (history entry title or launch target label; `Chat` before a history entry exists). */
export const notifySessionAttention = (
  snapshot: BackendHarnessSnapshot,
  launchTarget: AgentLaunchTarget,
  sessionId: string,
  event: AttentionEvent,
) => {
  // A subagent's attention event names the child under its root session's title.
  const child = getSubagent(snapshot.subagents, sessionId);
  const rootId = rootAncestorId(snapshot.subagents, sessionId);
  const rootTitle = sessionChatTitle(
    false,
    snapshot.sessionHistory.find(entry => entry.sessionId === rootId),
    launchTarget,
  );
  return notifyAttention(child === undefined ? rootTitle : `${rootTitle} · ${child.name ?? 'Subagent'}`, event);
};
