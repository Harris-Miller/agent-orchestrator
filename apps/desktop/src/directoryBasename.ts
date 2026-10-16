/** Last path segment of a cwd (trailing separators stripped). */
export const directoryBasename = (cwd: string): string => {
  const trimmed = cwd.replace(/[/\\]+$/, '');
  const segment = trimmed.split(/[/\\]/).pop();
  return segment !== undefined && segment.length > 0 ? segment : cwd;
};
