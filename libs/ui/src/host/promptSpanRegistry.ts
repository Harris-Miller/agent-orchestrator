/** Active `sendPrompt` spans for turn-correlated Agent→Client work. */
import type { Tracer } from 'effect';

const promptSpans = new Map<string, Tracer.AnySpan>();

const key = (launchTarget: string, sessionId: string): string => `${launchTarget}:${sessionId}`;

export const setPromptSpan = (launchTarget: string, sessionId: string, span: Tracer.AnySpan): void => {
  promptSpans.set(key(launchTarget, sessionId), span);
};

/** child session id → announcing parent, so child work parents under the root ancestor's prompt span. */
const subagentParents = new Map<string, string>();

export const setSubagentParent = (launchTarget: string, childId: string, parentId: string): void => {
  if (!subagentParents.has(key(launchTarget, childId))) {
    subagentParents.set(key(launchTarget, childId), parentId);
  }
};

const rootAncestor = (launchTarget: string, sessionId: string): string => {
  const seen = new Set<string>();
  let current = sessionId;
  for (;;) {
    const parent = subagentParents.get(key(launchTarget, current));
    if (parent === undefined || seen.has(current)) return current;
    seen.add(current);
    current = parent;
  }
};

/** Child ids resolve to the root ancestor's in-flight prompt span; a closed root turn yields undefined (short root). */
export const getPromptSpan = (launchTarget: string, sessionId: string): Tracer.AnySpan | undefined =>
  promptSpans.get(key(launchTarget, rootAncestor(launchTarget, sessionId)));

export const clearPromptSpan = (launchTarget: string, sessionId: string): void => {
  promptSpans.delete(key(launchTarget, sessionId));
};

export const clearPromptSpansForLaunchTarget = (launchTarget: string): void => {
  const prefix = `${launchTarget}:`;
  for (const k of promptSpans.keys()) {
    if (k.startsWith(prefix)) {
      promptSpans.delete(k);
    }
  }
  for (const k of subagentParents.keys()) {
    if (k.startsWith(prefix)) {
      subagentParents.delete(k);
    }
  }
};
