/** In-flight `sendPrompt` spans for turn-correlated Agent→Client work. */
import type { Tracer } from 'effect';

const promptSpans = new Map<string, Tracer.AnySpan>();

const key = (backend: string, sessionId: string): string => `${backend}:${sessionId}`;

export const setPromptSpan = (backend: string, sessionId: string, span: Tracer.AnySpan): void => {
  promptSpans.set(key(backend, sessionId), span);
};

export const getPromptSpan = (backend: string, sessionId: string): Tracer.AnySpan | undefined =>
  promptSpans.get(key(backend, sessionId));

export const clearPromptSpan = (backend: string, sessionId: string): void => {
  promptSpans.delete(key(backend, sessionId));
};

export const clearPromptSpansForBackend = (backend: string): void => {
  const prefix = `${backend}:`;
  for (const k of promptSpans.keys()) {
    if (k.startsWith(prefix)) {
      promptSpans.delete(k);
    }
  }
};
