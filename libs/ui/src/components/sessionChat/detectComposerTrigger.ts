import type { AgentLaunchTarget } from '../../host/agentLaunchTarget.ts';

import { isWhitespace } from './composerCommandTokens.ts';
import type { ComposerTrigger } from './composerCommandTokens.ts';

export type DetectComposerTriggerArgs = {
  readonly adjacentToToken: boolean;
  readonly cursor: number;
  readonly launchTarget: AgentLaunchTarget | undefined;
  readonly text: string;
};

/**
 * Detect an in-progress `/` or `$` composer trigger from draft text + logical cursor.
 * Codex: `/` only at draft index 0; `$` whitespace-bounded anywhere.
 * Non-Codex: `/` whitespace-bounded anywhere; no `$` menu.
 */
export const detectComposerTrigger = ({
  adjacentToToken,
  cursor,
  launchTarget,
  text,
}: DetectComposerTriggerArgs): ComposerTrigger | null => {
  if (adjacentToToken || launchTarget === undefined) {
    return null;
  }

  const clamped = Math.max(0, Math.min(cursor, text.length));
  let rangeStart = clamped;
  while (rangeStart > 0 && !isWhitespace(text[rangeStart - 1])) {
    rangeStart -= 1;
  }

  const token = text.slice(rangeStart, clamped);
  if (token.length === 0) {
    return null;
  }

  const isCodex = launchTarget === 'codex-acp';

  if (token.startsWith('/')) {
    if (isCodex && rangeStart !== 0) {
      return null;
    }
    return {
      kind: 'slash',
      query: token.slice(1),
      rangeEnd: clamped,
      rangeStart,
    };
  }

  if (token.startsWith('$')) {
    if (!isCodex) {
      return null;
    }
    return {
      kind: 'dollar',
      query: token.slice(1),
      rangeEnd: clamped,
      rangeStart,
    };
  }

  return null;
};
