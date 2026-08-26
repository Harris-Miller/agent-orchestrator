import { Schema } from 'effect';
import { Rpc } from 'effect/unstable/rpc';

import { MetaField, RequestId } from './common.ts';

const PROTOCOL_METHODS = {
  cancel_request: '$/cancel_request',
} as const;

export class CancelRequestNotification extends Schema.Opaque<CancelRequestNotification>()(
  Schema.Struct({
    _meta: MetaField,
    requestId: RequestId,
  }),
) {}

export class CancelRequest extends Rpc.make(PROTOCOL_METHODS.cancel_request, {
  payload: CancelRequestNotification,
}) {}
