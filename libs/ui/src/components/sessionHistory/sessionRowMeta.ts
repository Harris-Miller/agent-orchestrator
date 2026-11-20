import type { AirActivityState, AirRowMeta } from '../../host/airMeta.ts';

/** The badge a row shows for its **Activity state**; none while the row is unavailable (cached/stale) or a Pending client request spinner replaces it. */
export const activityBadgeOf = (
  meta: AirRowMeta,
  options: { readonly available: boolean; readonly pendingClientRequest: boolean },
): AirActivityState | undefined =>
  options.available && !options.pendingClientRequest ? meta.activityState : undefined;

/** Title shown for a Session without one. */
export const DEFAULT_SESSION_TITLE = 'New Session';
