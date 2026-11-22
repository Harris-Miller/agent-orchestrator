import { directoryBasename } from './directoryBasename.ts';

/** A session's folder as a row caption: the Project basename, or "contextless" under the contextless root. */
export const cwdCaption = (cwd: string): string =>
  cwd.replaceAll('\\', '/').includes('/.hoa/contextless/') ? 'contextless' : directoryBasename(cwd);
