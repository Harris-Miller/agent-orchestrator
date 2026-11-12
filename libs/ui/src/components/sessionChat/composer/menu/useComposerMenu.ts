/**
 * Composer Menu glue (glossary: Composer, Composer Trigger, Composer Menu): owns the menu state, the caret refs, the
 * match lists, focus clamping and choose/close semantics, and hands back what the editor and the two menus consume.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';

import type { ComposerImageSource } from '../../../../atoms/composer.atoms.ts';
import type { SessionFsListingState } from '../../../../atoms/sessionFsListing.atoms.ts';
import type { AgentLaunchTarget } from '../../../../host/agentLaunchTarget.ts';
import { hostRuntime } from '../../../../hostRuntime.ts';
import type { AvailableCommand } from '../../../../host/sessionUpdateReducer.ts';

import type { ComposerCommandMenuKeyHandlers, ComposerPromptChange } from '../editor/ComposerPromptEditor.tsx';
import type { ComposerCommandMenuProps } from './ComposerCommandMenu.tsx';
import type { ComposerMentionMenuProps } from './ComposerMentionMenu.tsx';
import {
  applyComposerMenuChoice,
  clampComposerMenuFocus,
  CLOSED_COMPOSER_MENU,
  composerMenuAfterChange,
  moveComposerMenuFocus,
} from './composerMenu.ts';
import type { ComposerMenuChoice } from './composerMenu.ts';
import { detectComposerTrigger, isCommandTrigger } from './composerTrigger.ts';
import { filterAvailableCommandMatches } from './filterAvailableCommands.ts';
import { filterFsListingMatches } from './filterFsListingEntries.ts';
import { resolveComposerFsMentions } from './resolveComposerFsMentions.ts';

export type UseComposerMenuArgs = {
  readonly attachImages: (source: ComposerImageSource) => Promise<unknown>;
  readonly availableCommands: readonly AvailableCommand[];
  readonly draft: string;
  readonly fsListing: Pick<SessionFsListingState, 'entries' | 'status'>;
  readonly launchTarget: AgentLaunchTarget | undefined;
  readonly onClientError: (error: unknown) => void;
  readonly sessionCwd: string | undefined;
  readonly setDraft: (text: string) => void;
};

export type UseComposerMenu = {
  /** Reset to closed (Composer calls this on Send). */
  readonly close: () => void;
  readonly commandMenuProps: ComposerCommandMenuProps;
  /** Editor key handlers; drive both the command and the mention menu. */
  readonly keyHandlers: ComposerCommandMenuKeyHandlers;
  readonly mentionMenuProps: ComposerMentionMenuProps;
  readonly onChange: (change: ComposerPromptChange) => void;
  /** Cursor the editor applies after an external draft sync, then clears. */
  readonly syncCursorRef: RefObject<null | number>;
};

export const useComposerMenu = ({
  attachImages,
  availableCommands,
  draft,
  fsListing,
  launchTarget,
  onClientError,
  sessionCwd,
  setDraft,
}: UseComposerMenuArgs): UseComposerMenu => {
  const [menu, setMenu] = useState(CLOSED_COMPOSER_MENU);
  const composerTrigger = menu.trigger;
  const cursorRef = useRef(0);
  const syncCursorRef = useRef<null | number>(null);

  const commandOpen = isCommandTrigger(composerTrigger);
  const mentionTrigger = composerTrigger?.kind === 'at' ? composerTrigger : null;

  const filteredCommandMatches = useMemo(() => {
    if (!isCommandTrigger(composerTrigger)) {
      return [];
    }
    return filterAvailableCommandMatches(availableCommands, composerTrigger.kind, composerTrigger.query, launchTarget);
  }, [availableCommands, composerTrigger, launchTarget]);

  const filteredMentions = useMemo(() => {
    if (mentionTrigger === null) {
      return [];
    }
    return filterFsListingMatches(fsListing.entries, mentionTrigger.query);
  }, [fsListing.entries, mentionTrigger]);

  const mentionLoading = mentionTrigger !== null && fsListing.status === 'loading';

  const clampedCommandFocus = clampComposerMenuFocus(menu.focus, filteredCommandMatches.length);
  const clampedMentionFocus = clampComposerMenuFocus(menu.focus, filteredMentions.length);

  const setMenuFocus = useCallback((focus: number) => {
    setMenu(prev => ({ ...prev, focus }));
  }, []);

  const close = useCallback(() => {
    setMenu(CLOSED_COMPOSER_MENU);
  }, []);

  const chooseMenuItem = useCallback(
    (choice: ComposerMenuChoice) => {
      const next = applyComposerMenuChoice({ cursor: cursorRef.current, draft, launchTarget, sessionCwd }, choice);
      setMenu(CLOSED_COMPOSER_MENU);
      if (next === undefined) {
        return;
      }
      syncCursorRef.current = next.cursor;
      cursorRef.current = next.cursor;
      setDraft(next.draft);
      if (next.imagePath !== undefined) {
        attachImages({ _tag: 'Paths', paths: [next.imagePath] }).catch(onClientError);
      }
    },
    [attachImages, draft, launchTarget, onClientError, sessionCwd, setDraft],
  );

  const onChange = useCallback(
    ({ adjacentToToken, cursor, text }: ComposerPromptChange) => {
      cursorRef.current = cursor;
      setDraft(text);
      const trigger = detectComposerTrigger({ adjacentToToken, cursor, launchTarget, text });
      setMenu(prev => composerMenuAfterChange(prev, trigger));
    },
    [launchTarget, setDraft],
  );

  const activeMenuCount = mentionTrigger !== null ? filteredMentions.length : filteredCommandMatches.length;

  const keyHandlers = useMemo(
    () => ({
      onArrowDown: () => {
        setMenu(prev => moveComposerMenuFocus(prev, 1, activeMenuCount));
      },
      onArrowUp: () => {
        setMenu(prev => moveComposerMenuFocus(prev, -1, activeMenuCount));
      },
      onDismiss: close,
      onSelect: () => {
        if (mentionTrigger !== null) {
          const match = filteredMentions.at(clampedMentionFocus);
          if (match == null) {
            return;
          }
          chooseMenuItem({ _tag: 'Mention', entry: match.entry });
          return;
        }
        const commandMatch = filteredCommandMatches.at(clampedCommandFocus);
        if (commandMatch == null) {
          return;
        }
        chooseMenuItem({ _tag: 'Command', command: commandMatch.command });
      },
      onSpaceDismiss: close,
      open: composerTrigger !== null,
    }),
    [
      activeMenuCount,
      chooseMenuItem,
      clampedCommandFocus,
      clampedMentionFocus,
      close,
      composerTrigger,
      filteredCommandMatches,
      filteredMentions,
      mentionTrigger,
    ],
  );

  // Paste / whitespace-commit: resolve `@path` and FS markdown links in parallel.
  // Image hits become attachments (same as paperclip / @-menu); skip while trigger menu open. The attach is handed
  // to the Composer in the same step as the rewrite, so the re-run the rewrite causes cannot drop it.
  useEffect(() => {
    if (sessionCwd === undefined || draft.length === 0 || composerTrigger !== null) {
      return;
    }
    let cancelled = false;
    const cursor = cursorRef.current;
    hostRuntime
      .runPromise(resolveComposerFsMentions(draft, sessionCwd))
      .then(resolved => {
        if (cancelled) {
          return;
        }
        if (resolved.draft !== draft) {
          syncCursorRef.current = cursor;
          setDraft(resolved.draft);
        }
        if (resolved.imageAbsolutePaths.length > 0) {
          attachImages({ _tag: 'Paths', paths: resolved.imageAbsolutePaths }).catch(() => undefined);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [attachImages, composerTrigger, draft, sessionCwd, setDraft]);

  return {
    close,
    commandMenuProps: {
      focusedIndex: clampedCommandFocus,
      matches: filteredCommandMatches,
      onFocusIndexChange: setMenuFocus,
      onSelect: command => {
        chooseMenuItem({ _tag: 'Command', command });
      },
      open: commandOpen,
    },
    keyHandlers,
    mentionMenuProps: {
      focusedIndex: clampedMentionFocus,
      loading: mentionLoading,
      matches: filteredMentions,
      onFocusIndexChange: setMenuFocus,
      onSelect: entry => {
        chooseMenuItem({ _tag: 'Mention', entry });
      },
      open: mentionTrigger !== null,
    },
    onChange,
    syncCursorRef,
  };
};
