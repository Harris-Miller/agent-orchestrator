/**
 * Composer Menu model (glossary: Composer Trigger, Composer Menu, Filesystem Mention, Available Command): what the
 * Trigger becomes on each change, where keyboard focus goes, and what choosing an item does to the draft. Pure; the
 * view holds one {@link ComposerMenuState} and renders.
 */
import type { AgentLaunchTarget } from '../../../../host/agentLaunchTarget.ts';
import { mimeTypeForImagePath } from '../../../../host/composerImageAttachment.ts';
import type { FdListingEntry } from '../../../../host/fdListing.ts';
import type { AvailableCommand } from '../../../../host/sessionUpdateReducer.ts';

import { commandInvocation } from '../../chips/chipSegments.ts';
import { detectComposerTrigger, replaceComposerTriggerRange } from './composerTrigger.ts';
import type { ComposerTrigger } from './composerTrigger.ts';
import { absolutePathForMentionEntry, mentionMarkdownForEntry } from './mentionMarkdown.ts';

export type ComposerMenuState = { readonly focus: number; readonly trigger: ComposerTrigger | null };

export const CLOSED_COMPOSER_MENU: ComposerMenuState = { focus: 0, trigger: null };

/** Draft or caret changed: a `null` Trigger closes; same kind + query keeps focus (range refreshed); otherwise 0. */
export const composerMenuAfterChange = (
  state: ComposerMenuState,
  trigger: ComposerTrigger | null,
): ComposerMenuState => {
  if (trigger === null) {
    return CLOSED_COMPOSER_MENU;
  }
  const same = state.trigger?.kind === trigger.kind && state.trigger.query === trigger.query;
  return { focus: same ? state.focus : 0, trigger };
};

/** Focus within `count` items: `[0, count - 1]`, or 0 when there are none. */
export const clampComposerMenuFocus = (focus: number, count: number): number =>
  count === 0 ? 0 : Math.max(0, Math.min(focus, count - 1));

/** Arrow keys: focus moves by `delta` from the clamped focus, then is clamped again. */
export const moveComposerMenuFocus = (state: ComposerMenuState, delta: -1 | 1, count: number): ComposerMenuState => ({
  ...state,
  focus: clampComposerMenuFocus(clampComposerMenuFocus(state.focus, count) + delta, count),
});

export type ComposerMenuChoice =
  | { readonly _tag: 'Command'; readonly command: AvailableCommand }
  | { readonly _tag: 'Mention'; readonly entry: FdListingEntry };

export type ComposerMenuEdit = {
  readonly cursor: number;
  readonly draft: string;
  /** Absolute path of a chosen image file, to add as a Composer Image Attachment. */
  readonly imagePath: string | undefined;
};

/**
 * Apply a choice at the live Trigger under the caret. `undefined` when the caret is not in a matching Trigger
 * (Command needs `/` or `$`, Mention needs `@` and a session cwd, and no Trigger is detected without a launch
 * target); the caller then only closes the menu.
 * Command → `commandInvocation(command.name)` + space; Mention → mention markdown; image file Mention → the Trigger
 * is removed and `imagePath` is set.
 */
export const applyComposerMenuChoice = (
  input: {
    readonly cursor: number;
    readonly draft: string;
    readonly launchTarget: AgentLaunchTarget | undefined;
    readonly sessionCwd: string | undefined;
  },
  choice: ComposerMenuChoice,
): ComposerMenuEdit | undefined => {
  const { cursor, draft, launchTarget, sessionCwd } = input;
  const trigger = detectComposerTrigger({ adjacentToToken: false, cursor, launchTarget, text: draft });
  if (trigger === null) {
    return undefined;
  }
  const replace = (insertion: string, imagePath?: string): ComposerMenuEdit => {
    const next = replaceComposerTriggerRange(draft, trigger, insertion);
    return { cursor: next.cursor, draft: next.text, imagePath };
  };
  if (choice._tag === 'Command') {
    return trigger.kind === 'at' ? undefined : replace(commandInvocation(choice.command.name));
  }
  if (trigger.kind !== 'at' || sessionCwd === undefined) {
    return undefined;
  }
  const absolute = absolutePathForMentionEntry(sessionCwd, choice.entry);
  return choice.entry.kind === 'file' && mimeTypeForImagePath(absolute) !== undefined
    ? replace('', absolute)
    : replace(mentionMarkdownForEntry(sessionCwd, choice.entry));
};
