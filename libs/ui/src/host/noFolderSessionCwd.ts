/**
 * Classify Session cwds that match vendor Desktop projectless / scratch path-segment
 * conventions into the shared No Folder group. Segment rules only — no homedir / env.
 */

/** Claude Desktop scratch leaf: `scratch-YYYY-MM-DD-<6hex>` (case-insensitive). */
const CLAUDE_SCRATCH_LEAF = /^scratch-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}$/;

const pathSegments = (cwd: string): readonly string[] => {
  const trimmed = cwd.replace(/\\/g, '/').replace(/\/+$/, '');
  return trimmed.split('/').filter(segment => segment.length > 0);
};

/**
 * True when `cwd` matches a registered No Folder segment rule (Claude scratch or Codex
 * Documents/Codex). Case-insensitive; accepts `/` and `\` separators.
 */
export const isNoFolderSessionCwd = (cwd: string): boolean => {
  const segments = pathSegments(cwd).map(segment => segment.toLowerCase());

  const scratchWorkspacesIndex = segments.indexOf('scratch-workspaces');
  if (scratchWorkspacesIndex !== -1) {
    for (const segment of segments.slice(scratchWorkspacesIndex + 1)) {
      if (CLAUDE_SCRATCH_LEAF.test(segment)) {
        return true;
      }
    }
  }

  for (let index = 0; index < segments.length - 1; index += 1) {
    if (segments[index] === 'documents' && segments[index + 1] === 'codex') {
      return true;
    }
  }

  return false;
};
