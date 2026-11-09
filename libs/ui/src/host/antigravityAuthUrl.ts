/** Parse Antigravity BROWSER helper stderr marker — Host OpenUrl opens the URL. */
import { ANTIGRAVITY_AUTH_URL_MARKER_PREFIX } from '@lib/hoa-home';

export { ANTIGRAVITY_AUTH_URL_MARKER_PREFIX };

/** Parse one stderr line; return URL when it carries the auth marker. */
export const parseAntigravityAuthUrlMarker = (line: string): string | undefined => {
  const trimmed = line.trim();
  if (!trimmed.startsWith(ANTIGRAVITY_AUTH_URL_MARKER_PREFIX)) {
    return undefined;
  }
  const url = trimmed.slice(ANTIGRAVITY_AUTH_URL_MARKER_PREFIX.length).trim();
  return url.length > 0 ? url : undefined;
};
