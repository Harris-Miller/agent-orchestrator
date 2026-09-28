/** Active `sendPrompt` spans for turn-correlated Agent→Client work. */
import type { Tracer } from 'effect';

const promptSpans = new Map<string, Tracer.AnySpan>();

const key = (launchTarget: string, sessionId: string): string => `${launchTarget}:${sessionId}`;

export const setPromptSpan = (launchTarget: string, sessionId: string, span: Tracer.AnySpan): void => {
  promptSpans.set(key(launchTarget, sessionId), span);
};

export const getPromptSpan = (launchTarget: string, sessionId: string): Tracer.AnySpan | undefined =>
  promptSpans.get(key(launchTarget, sessionId));

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
};
