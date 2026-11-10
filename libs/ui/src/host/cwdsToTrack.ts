import { isNoFolderSessionCwd } from './noFolderSessionCwd.ts';

/** Distinct cwds of visible Session History rows that are not tracked yet. No Folder cwds are never tracked. */
export const cwdsToTrack = (
  visibleHistory: readonly { readonly cwd: string }[],
  tracked: readonly string[],
): readonly string[] => [
  ...new Set(
    visibleHistory.map(entry => entry.cwd).filter(cwd => !tracked.includes(cwd) && !isNoFolderSessionCwd(cwd)),
  ),
];
