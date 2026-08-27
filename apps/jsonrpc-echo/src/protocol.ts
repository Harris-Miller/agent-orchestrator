import { Schema } from 'effect';

const JsonRpcId = Schema.Union([Schema.String, Schema.Number, Schema.Null]);

export const InitializeRequest = Schema.Struct({
  id: JsonRpcId,
  jsonrpc: Schema.Literal('2.0'),
  method: Schema.Literal('initialize'),
  params: Schema.optionalKey(Schema.Struct({})),
});
export type InitializeRequest = typeof InitializeRequest.Type;

export const MessageRequest = Schema.Struct({
  id: JsonRpcId,
  jsonrpc: Schema.Literal('2.0'),
  method: Schema.Literal('message'),
  params: Schema.optionalKey(
    Schema.Struct({
      echos: Schema.optionalKey(Schema.Array(Schema.String)),
    }),
  ),
});
export type MessageRequest = typeof MessageRequest.Type;

export const UnknownRequest = Schema.Struct({
  id: JsonRpcId,
  jsonrpc: Schema.Literal('2.0'),
  method: Schema.String,
  params: Schema.optionalKey(Schema.Unknown),
});
export type UnknownRequest = typeof UnknownRequest.Type;
