import type { AirActivityState, AirRowMeta } from '../../host/airMeta.ts';

import { truncateSessionId } from './truncateSessionId.ts';

/** The badge a row shows for its **Activity state**; none while the row is unavailable (cached/stale) or a Pending client request spinner replaces it. */
export const activityBadgeOf = (
  meta: AirRowMeta,
  options: { readonly available: boolean; readonly pendingClientRequest: boolean },
): AirActivityState | undefined =>
  options.available && !options.pendingClientRequest ? meta.activityState : undefined;

/** `amount` in `currency`; falls back to `"<amount> <currency>"` when the currency code is not valid. */
export const formatCost = (cost: NonNullable<AirRowMeta['cost']>): string => {
  try {
    return new Intl.NumberFormat(undefined, { currency: cost.currency, style: 'currency' }).format(cost.amount);
  } catch {
    return `${cost.amount} ${cost.currency}`;
  }
};

/** The parts of a row's meta line, in order: model, cost, Fork source. `forkSourceTitle` is that row's title when it is in History. */
export const rowMetaParts = (meta: AirRowMeta, forkSourceTitle: string | undefined): readonly string[] => [
  ...(meta.model === undefined ? [] : [meta.model]),
  ...(meta.cost === undefined ? [] : [formatCost(meta.cost)]),
  ...(meta.forkSource === undefined ? [] : [`Forked from ${forkSourceTitle ?? truncateSessionId(meta.forkSource)}`]),
];

/** The meta line text, or undefined when the row has no parts. */
export const rowMetaLine = (meta: AirRowMeta, forkSourceTitle: string | undefined): string | undefined => {
  const parts = rowMetaParts(meta, forkSourceTitle);
  return parts.length === 0 ? undefined : parts.join(' · ');
};

/** Title shown for a Session without one. */
export const DEFAULT_SESSION_TITLE = 'New Session';

/** Title of the History row `forkSource` points at; undefined when there is no Fork source or it is not in History. */
export const forkSourceTitleOf = (
  history: readonly { readonly sessionId: string; readonly title?: string | undefined }[],
  forkSource: string | undefined,
): string | undefined => {
  if (forkSource === undefined) return undefined;
  const row = history.find(item => item.sessionId === forkSource);
  return row === undefined ? undefined : (row.title ?? DEFAULT_SESSION_TITLE);
};
