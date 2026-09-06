import { CreateElicitationSessionRequest } from '@libs/effect-acp';
import type {
  CreateElicitationRequestBody,
  CreateElicitationResponseBody,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@libs/effect-acp';
import { Schema } from 'effect';

export type PendingElicitation = {
  readonly request: CreateElicitationRequestBody;
  readonly resolve: (response: CreateElicitationResponseBody) => void;
  readonly sessionId: string;
};

export type PendingPermission = {
  readonly request: RequestPermissionRequest;
  readonly resolve: (response: RequestPermissionResponse) => void;
  readonly sessionId: string;
};

export const sessionIdFromElicitationRequest = (request: CreateElicitationRequestBody): string | undefined => {
  if (Schema.is(CreateElicitationSessionRequest)(request)) {
    return request.sessionId;
  }
  return undefined;
};
