import type {
  CreateElicitationRequestBody,
  CreateElicitationResponseBody,
  RequestPermissionRequest,
  RequestPermissionResponse,
} from '@libs/effect-acp';

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
  if ('sessionId' in request && typeof (request as { sessionId?: unknown }).sessionId === 'string') {
    return (request as { sessionId: string }).sessionId;
  }
  return undefined;
};
