/** Antigravity BROWSER helper stderr marker — Host OpenUrl opens the URL. */

export const ANTIGRAVITY_AUTH_URL_MARKER_PREFIX = 'AO_ANTIGRAVITY_AUTH_URL:';

/** Parse one stderr line; return URL when it carries the auth marker. */
export const parseAntigravityAuthUrlMarker = (line: string): string | undefined => {
  const trimmed = line.trim();
  if (!trimmed.startsWith(ANTIGRAVITY_AUTH_URL_MARKER_PREFIX)) {
    return undefined;
  }
  const url = trimmed.slice(ANTIGRAVITY_AUTH_URL_MARKER_PREFIX.length).trim();
  return url.length > 0 ? url : undefined;
};

/** Shell script body for the capture-only `BROWSER` helper (prints marker, does not open). */
export const antigravityBrowserHelperScript = `#!/bin/sh
printf '%s%s\\n' '${ANTIGRAVITY_AUTH_URL_MARKER_PREFIX}' "$1" >&2
`;
