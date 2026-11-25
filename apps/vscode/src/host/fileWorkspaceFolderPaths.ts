/**
 * Map VS Code workspace folders to absolute file-scheme paths (order preserved).
 * Non-file schemes are dropped; missing/empty folders → [].
 */
export const fileWorkspaceFolderPaths = (
  folders:
    | null
    | readonly {
        readonly uri: { readonly fsPath: string; readonly scheme: string };
      }[]
    | undefined,
): readonly string[] => {
  if (folders == null || folders.length === 0) {
    return [];
  }
  return folders.filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath);
};

/**
 * Absolute path of a saved workspace's `.code-workspace` file; `undefined` for no workspace file,
 * untitled workspaces and any non-file scheme.
 */
export const fileWorkspaceFilePath = (
  workspaceFile: undefined | { readonly fsPath: string; readonly scheme: string },
): string | undefined => (workspaceFile?.scheme === 'file' ? workspaceFile.fsPath : undefined);
