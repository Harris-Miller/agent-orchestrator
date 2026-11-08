import { CreateElicitationSessionRequest } from '@libs/effect-acp';
import type {
  CreateElicitationRequestBody,
  CreateElicitationResponseBody,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@libs/effect-acp';
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
