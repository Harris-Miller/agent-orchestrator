import type { AgentLaunchTarget } from '../../../../host/agentLaunchTarget.ts';

import { isWhitespace } from '../../isWhitespace.ts';

export type DetectComposerTriggerArgs = {
  readonly adjacentToToken: boolean;
  readonly cursor: number;
  readonly launchTarget: AgentLaunchTarget | undefined;
  readonly text: string;
};

/**
 * Detect an in-progress `/`, `$`, or `@` composer trigger from draft text + logical cursor.
 * `$` whitespace-bounded anywhere for all agents (lists skills).
 * Codex: `/` only at draft index 0; other agents: `/` whitespace-bounded anywhere.
 * `@` whitespace-bounded anywhere for all agents; menu opens from `@` alone.
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

  if (token.startsWith('@')) {
    return {
      kind: 'at',
      query: token.slice(1),
      rangeEnd: clamped,
      rangeStart,
    };
  }

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
    return {
      kind: 'dollar',
      query: token.slice(1),
      rangeEnd: clamped,
      rangeStart,
    };
  }

  return null;
};

export type ComposerTriggerKind = 'at' | 'dollar' | 'slash';

export type ComposerTrigger = {
  readonly kind: ComposerTriggerKind;
  readonly query: string;
  readonly rangeEnd: number;
  readonly rangeStart: number;
};

/** Replace the live trigger range with `invocation` + trailing space (coalesce one existing space). */
export const replaceComposerTriggerRange = (
  text: string,
  trigger: ComposerTrigger,
  invocation: string,
): { readonly cursor: number; readonly text: string } => {
  let { rangeEnd } = trigger;
  if (text[rangeEnd] === ' ') {
    rangeEnd += 1;
  }
  const insertion = `${invocation} `;
  const next = text.slice(0, trigger.rangeStart) + insertion + text.slice(rangeEnd);
  return { cursor: trigger.rangeStart + insertion.length, text: next };
};

/** `/` or `$` Triggers open the Command menu; `@` opens the Mention menu. */
export const isCommandTrigger = (
  trigger: ComposerTrigger | null,
): trigger is { readonly kind: 'dollar' | 'slash' } & ComposerTrigger =>
  trigger?.kind === 'slash' || trigger?.kind === 'dollar';
