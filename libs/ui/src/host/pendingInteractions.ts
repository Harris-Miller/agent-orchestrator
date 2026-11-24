import { CreateElicitationSessionRequest } from '@lib/effect-acp';
import type {
  CreateElicitationRequestBody,
  CreateElicitationResponseBody,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@lib/effect-acp';
import { Schema } from 'effect';

export type PendingElicitation = {
  /** Unique per request, so identical consecutive requests still remount the card. */
  readonly id: string;
  readonly request: CreateElicitationRequestBody;
  readonly resolve: (response: CreateElicitationResponseBody) => void;
  readonly sessionId: string;
};

export type PendingPermission = {
  readonly request: RequestPermissionRequest;
  readonly resolve: (response: RequestPermissionResponse) => void;
  readonly sessionId: string;
};

/** A `resolve` that acts only on its first call: a Pending interaction is answered at most once. */
const once = <A>(resolve: (response: A) => void): ((response: A) => void) => {
  let settled = false;
  return response => {
    if (!settled) {
      settled = true;
      resolve(response);
    }
  };
};

/** A Pending permission whose `resolve` answers the agent at most once. */
export const pendingPermission = (pending: PendingPermission): PendingPermission => ({
  ...pending,
  resolve: once(pending.resolve),
});

/** A Pending elicitation whose `resolve` answers the agent at most once. */
export const pendingElicitation = (pending: PendingElicitation): PendingElicitation => ({
  ...pending,
  resolve: once(pending.resolve),
});

/**
 * A Session or Subagent session's Pending interactions, oldest first per kind: the one shown (`pendingPermission` /
 * `pendingElicitation`) and the ones waiting behind it. Nothing waits while nothing is shown.
 */
export type PendingHolder = {
  readonly pendingElicitation?: PendingElicitation | undefined;
  readonly pendingPermission?: PendingPermission | undefined;
  readonly waitingElicitations?: readonly PendingElicitation[] | undefined;
  readonly waitingPermissions?: readonly PendingPermission[] | undefined;
};

/** Every Pending permission `holder` holds, the shown one first. */
export const permissionsOf = (holder: PendingHolder): readonly PendingPermission[] =>
  holder.pendingPermission === undefined ? [] : [holder.pendingPermission, ...(holder.waitingPermissions ?? [])];

/** Every Pending elicitation `holder` holds, the shown one first. */
export const elicitationsOf = (holder: PendingHolder): readonly PendingElicitation[] =>
  holder.pendingElicitation === undefined ? [] : [holder.pendingElicitation, ...(holder.waitingElicitations ?? [])];

/** How many Pending interactions wait behind the shown ones. */
export const waitingCount = (holder: PendingHolder): number =>
  (holder.waitingPermissions?.length ?? 0) + (holder.waitingElicitations?.length ?? 0);

const withPermissions = <H extends PendingHolder>(holder: H, [shown, ...waiting]: readonly PendingPermission[]): H => {
  const { waitingPermissions: _waiting, ...rest } = holder;
  // `rest` is `holder` without the optional waiting list, so it is still an `H`.
  return { ...rest, pendingPermission: shown, ...(waiting.length === 0 ? {} : { waitingPermissions: waiting }) } as H;
};

const withElicitations = <H extends PendingHolder>(
  holder: H,
  [shown, ...waiting]: readonly PendingElicitation[],
): H => {
  const { waitingElicitations: _waiting, ...rest } = holder;
  // `rest` is `holder` without the optional waiting list, so it is still an `H`.
  return { ...rest, pendingElicitation: shown, ...(waiting.length === 0 ? {} : { waitingElicitations: waiting }) } as H;
};

/** `pending` added to `holder`: shown when nothing is, else waiting behind the others. */
export const queuePermission = <H extends PendingHolder>(holder: H, pending: PendingPermission): H =>
  withPermissions(holder, [...permissionsOf(holder), pending]);

/** `pending` added to `holder`: shown when nothing is, else waiting behind the others. */
export const queueElicitation = <H extends PendingHolder>(holder: H, pending: PendingElicitation): H =>
  withElicitations(holder, [...elicitationsOf(holder), pending]);

/** `holder` without the given Pending interactions (by identity); the oldest one left is shown next. */
export const withoutPendingInteractions = <H extends PendingHolder>(
  holder: H,
  removed: {
    readonly elicitations?: readonly PendingElicitation[];
    readonly permissions?: readonly PendingPermission[];
  },
): H => {
  const elicitations = new Set(removed.elicitations);
  const permissions = new Set(removed.permissions);
  return withElicitations(
    withPermissions(
      holder,
      permissionsOf(holder).filter(pending => !permissions.has(pending)),
    ),
    elicitationsOf(holder).filter(pending => !elicitations.has(pending)),
  );
};

/** `holder` without any Pending interaction. */
export const withoutAllPendingInteractions = <H extends PendingHolder>(holder: H): H =>
  withElicitations(withPermissions(holder, []), []);

const pendingOf = (holders: Iterable<PendingHolder>) => {
  const permissions = new Set<PendingPermission>();
  const elicitations = new Set<PendingElicitation>();
  for (const holder of holders) {
    for (const permission of permissionsOf(holder)) permissions.add(permission);
    for (const elicitation of elicitationsOf(holder)) elicitations.add(elicitation);
  }
  return { elicitations, permissions };
};

/**
 * Cancel every Pending interaction held `before` that is gone `after` (compared by identity, so one that only moved,
 * e.g. from a stray root entry onto its Subagent session, stays open). An answered one is not resolved again.
 */
export const cancelDroppedPendingInteractions = (
  before: Iterable<PendingHolder>,
  after: Iterable<PendingHolder>,
): void => {
  const was = pendingOf(before);
  if (was.permissions.size === 0 && was.elicitations.size === 0) {
    return;
  }
  const kept = pendingOf(after);
  for (const permission of was.permissions) {
    if (!kept.permissions.has(permission)) permission.resolve({ outcome: { outcome: 'cancelled' } });
  }
  for (const elicitation of was.elicitations) {
    if (!kept.elicitations.has(elicitation)) elicitation.resolve({ action: 'cancel' });
  }
};

/** A permission or elicitation request awaits the user (on a Session or a Subagent session). */
export const hasPendingInteraction = (target: {
  readonly pendingElicitation?: PendingElicitation;
  readonly pendingPermission?: PendingPermission;
}): boolean => target.pendingElicitation !== undefined || target.pendingPermission !== undefined;

export const sessionIdFromElicitationRequest = (request: CreateElicitationRequestBody): string | undefined => {
  if (Schema.is(CreateElicitationSessionRequest)(request)) {
    return request.sessionId;
  }
  return undefined;
};
