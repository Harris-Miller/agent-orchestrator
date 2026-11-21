import { airRowMetaOf } from './airMeta.ts';

/** The time an Import row shows: its Last prompt time (`_meta.jetbrains.air.lastPromptAt`), else `updatedAt`; undefined when neither parses. */
export const importRowTime = (
  entry: Readonly<Record<string, unknown>> & { readonly updatedAt?: string },
): Date | undefined => {
  for (const candidate of [airRowMetaOf(entry).lastPromptTime, entry.updatedAt]) {
    const time = Date.parse(candidate ?? '');
    if (Number.isFinite(time)) return new Date(time);
  }
  return undefined;
};
