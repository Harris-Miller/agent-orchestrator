import type { NormalizedSessionInfo } from './acpSessionBootstrap.ts';

/** The time an Import row shows: its Last prompt time, else `updatedAt`; undefined when neither parses. */
export const importRowTime = (entry: NormalizedSessionInfo): Date | undefined => {
  for (const candidate of [entry.lastPromptTime, entry.updatedAt]) {
    const time = Date.parse(candidate ?? '');
    if (Number.isFinite(time)) return new Date(time);
  }
  return undefined;
};
