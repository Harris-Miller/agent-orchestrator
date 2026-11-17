import { Base64Image } from '@lib/context-services';
import { Schema } from 'effect';

import type { IpcPort } from './port.ts';

/** Correlation id for request/response control messages. */
export const CorrelationId = Schema.String;
export type CorrelationId = typeof CorrelationId.Type;

/** Extension-allocated opaque child-process handle id. */
export const HandleId = Schema.String;
export type HandleId = typeof HandleId.Type;

export const StdioMode = Schema.Literals(['pipe', 'inherit', 'ignore']);
export type StdioMode = typeof StdioMode.Type;

export const SpawnOptions = Schema.Struct({
  cwd: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  extendEnv: Schema.optional(Schema.Boolean),
  stderr: Schema.optional(StdioMode),
  stdin: Schema.optional(StdioMode),
  stdout: Schema.optional(StdioMode),
});
export type SpawnOptions = typeof SpawnOptions.Type;

export const MakeDirectoryOptions = Schema.Struct({
  recursive: Schema.optional(Schema.Boolean),
});
export type MakeDirectoryOptions = typeof MakeDirectoryOptions.Type;

export const MakeTempDirectoryOptions = Schema.Struct({
  directory: Schema.optional(Schema.String),
  prefix: Schema.optional(Schema.String),
});
export type MakeTempDirectoryOptions = typeof MakeTempDirectoryOptions.Type;

export const RemoveOptions = Schema.Struct({
  recursive: Schema.optional(Schema.Boolean),
});
export type RemoveOptions = typeof RemoveOptions.Type;

/**
 * Host IPC request table: one entry per **Host IPC request** (webview → extension), pairing the
 * request's fields with its Result's fields. The wire tags are `<Tag>` and `<Tag>Result`, both
 * carrying the request's {@link CorrelationId} as `id` (added here, not per entry). A request is
 * answered by exactly one Result or one `Error` with the same `id`.
 */
export const HostIpcRequests = {
  AppExit: { request: {}, result: {} },
  BundledResolve: {
    request: { resourcePath: Schema.String },
    result: { path: Schema.String },
  },
  FileDialogPickFiles: {
    request: {
      filters: Schema.optional(
        Schema.Array(
          Schema.Struct({
            extensions: Schema.Array(Schema.String),
            name: Schema.String,
          }),
        ),
      ),
      multiple: Schema.optional(Schema.Boolean),
    },
    result: { paths: Schema.Array(Schema.String) },
  },
  FsAtomicReplaceFileString: {
    request: { content: Schema.String, path: Schema.String },
    result: {},
  },
  FsCopyFile: {
    request: { fromPath: Schema.String, toPath: Schema.String },
    result: {},
  },
  FsExists: {
    request: { path: Schema.String },
    result: { exists: Schema.Boolean },
  },
  FsMakeDirectory: {
    request: { options: Schema.optional(MakeDirectoryOptions), path: Schema.String },
    result: {},
  },
  FsMakeTempDirectory: {
    request: { options: Schema.optional(MakeTempDirectoryOptions) },
    result: { path: Schema.String },
  },
  FsReadFile: {
    request: { path: Schema.String },
    result: {
      /** Binary file payload (`ArrayBuffer`); may be transferred via postMessage. */
      bytes: Schema.Unknown,
    },
  },
  FsReadFileString: {
    request: { path: Schema.String },
    result: { content: Schema.String },
  },
  FsRemove: {
    request: { options: Schema.optional(RemoveOptions), path: Schema.String },
    result: {},
  },
  FsStat: {
    request: { path: Schema.String },
    result: {
      atime: Schema.optional(Schema.Number),
      birthtime: Schema.optional(Schema.Number),
      mtime: Schema.optional(Schema.Number),
      size: Schema.Number,
      type: Schema.Literals(['Directory', 'File', 'SymbolicLink', 'Unknown']),
    },
  },
  FsWriteFile: {
    request: {
      /** Binary payload (`ArrayBuffer`); may be transferred via postMessage. */
      bytes: Schema.Unknown,
      path: Schema.String,
    },
    result: {},
  },
  FsWriteFileString: {
    request: { content: Schema.String, path: Schema.String },
    result: {},
  },
  HttpFetch: {
    request: {
      /** Optional request body (`ArrayBuffer`); may be transferred via postMessage. */
      body: Schema.optional(Schema.Unknown),
      headers: Schema.Record(Schema.String, Schema.String),
      method: Schema.String,
      url: Schema.String,
    },
    result: {
      /** Optional response body (`ArrayBuffer`); may be transferred via postMessage. */
      body: Schema.optional(Schema.Unknown),
      headers: Schema.Record(Schema.String, Schema.String),
      status: Schema.Number,
      statusText: Schema.String,
    },
  },
  Kill: {
    request: { handleId: HandleId },
    result: {},
  },
  OpenFile: {
    request: { line: Schema.optional(Schema.Number), path: Schema.String },
    result: {},
  },
  OpenImageData: {
    request: Base64Image.fields,
    result: {},
  },
  OpenUrl: {
    request: { url: Schema.String },
    result: {},
  },
  OsSnapshot: {
    request: {},
    result: {
      arch: Schema.String,
      cwd: Schema.String,
      env: Schema.Record(Schema.String, Schema.String),
      homedir: Schema.String,
      platform: Schema.String,
    },
  },
  Spawn: {
    request: {
      args: Schema.Array(Schema.String),
      command: Schema.String,
      options: Schema.optional(SpawnOptions),
    },
    result: { handleId: HandleId, pid: Schema.Number },
  },
  WindowFocus: {
    request: {},
    result: { focused: Schema.Boolean },
  },
  WorkspaceFolders: {
    request: {},
    result: { paths: Schema.Array(Schema.String) },
  },
} satisfies Record<string, { readonly request: Schema.Struct.Fields; readonly result: Schema.Struct.Fields }>;

type HostIpcRequestTable = typeof HostIpcRequests;
export type HostIpcRequestTag = keyof HostIpcRequestTable;

/** **Host IPC push**es from webview to extension (no reply). */
const WebviewPushes = {
  StdinChunk: {
    bytes: Schema.Unknown,
    handleId: HandleId,
  },
  StdinEnd: {
    handleId: HandleId,
  },
};

/** **Host IPC push**es from extension to webview (no reply). */
const ExtensionPushes = {
  Exit: {
    code: Schema.Number,
    handleId: HandleId,
  },
  StderrChunk: {
    /** Transferred byte payload (`ArrayBuffer`); validated loosely for postMessage. */
    bytes: Schema.Unknown,
    handleId: HandleId,
  },
  StderrEnd: {
    handleId: HandleId,
  },
  StdoutChunk: {
    bytes: Schema.Unknown,
    handleId: HandleId,
  },
  StdoutEnd: {
    handleId: HandleId,
  },
  WorkspaceFoldersChanged: {
    paths: Schema.Array(Schema.String),
  },
};

type WithId<Fields extends Schema.Struct.Fields> = {
  readonly [K in keyof Fields | 'id']: K extends 'id' ? typeof CorrelationId : Fields[K];
};

type HostIpcRequestCases = {
  readonly [T in HostIpcRequestTag]: WithId<HostIpcRequestTable[T]['request']>;
};

type HostIpcResultCases = {
  readonly [T in HostIpcRequestTag as `${T}Result`]: WithId<HostIpcRequestTable[T]['result']>;
};

const hostIpcRequestCases = Object.fromEntries(
  Object.entries(HostIpcRequests).flatMap(([tag, { request, result }]) => [
    [tag, { ...request, id: CorrelationId }],
    [`${tag}Result`, { ...result, id: CorrelationId }],
  ]),
) as HostIpcRequestCases & HostIpcResultCases;

/**
 * Every Host IPC wire message: requests and their Results (from {@link HostIpcRequests}), pushes in
 * both directions, and the `Error` reply to any request.
 * Data chunks may carry an `ArrayBuffer` transferred via `postMessage` transfer list.
 */
export const IpcMessage = Schema.TaggedUnion({
  ...hostIpcRequestCases,
  ...WebviewPushes,
  ...ExtensionPushes,
  /** Failure reply to any Host IPC request. */
  Error: {
    id: CorrelationId,
    message: Schema.String,
  },
});
export type IpcMessage = typeof IpcMessage.Type;

/** A Host IPC request as sent on the wire (`_tag` + `id` + the table entry's request fields). */
export type HostIpcRequest<T extends HostIpcRequestTag = HostIpcRequestTag> = Extract<IpcMessage, { readonly _tag: T }>;

/** The Result answering Host IPC request `T` (`<T>Result` + `id` + the table entry's result fields). */
export type HostIpcResult<T extends HostIpcRequestTag = HostIpcRequestTag> = Extract<
  IpcMessage,
  { readonly _tag: `${T}Result` }
>;

/**
 * A Host IPC request before the client assigns its correlation `id`. Written as a mapped type keyed
 * by `_tag` so `IpcClient.request` infers `T` from the literal's tag and keeps excess-property checks.
 */
export type HostIpcRequestInput<T extends HostIpcRequestTag = HostIpcRequestTag> = {
  readonly [K in T]: { readonly _tag: K } & Omit<HostIpcRequest<K>, '_tag' | 'id'>;
}[T];

/** What a fulfillment handler returns for request `T`: its Result without `_tag` and `id`. */
export type HostIpcResultPayload<T extends HostIpcRequestTag> = Omit<HostIpcResult<T>, '_tag' | 'id'>;

export type WebviewPush = Extract<IpcMessage, { readonly _tag: keyof typeof WebviewPushes }>;
export type ExtensionPush = Extract<IpcMessage, { readonly _tag: keyof typeof ExtensionPushes }>;

export const isHostIpcRequest = (message: IpcMessage): message is HostIpcRequest =>
  Object.hasOwn(HostIpcRequests, message._tag);

export const isWebviewPush = (message: IpcMessage): message is WebviewPush =>
  Object.hasOwn(WebviewPushes, message._tag);

/** Wire tag of the Result answering request `tag`. */
export const resultTagOf = <T extends HostIpcRequestTag>(tag: T): `${T}Result` => `${tag}Result`;

export const decodeIpcMessage = Schema.decodeUnknownSync(IpcMessage);
export const encodeIpcMessage = Schema.encodeSync(IpcMessage);

/** Message tags that carry a transferable `bytes` ArrayBuffer. */
export const isTransferableChunkTag = (tag: IpcMessage['_tag']): boolean =>
  tag === 'StdoutChunk' || tag === 'StderrChunk' || tag === 'StdinChunk';

/** Transfer list for postMessage, when the message owns an ArrayBuffer payload. */
export const getIpcTransferList = (message: IpcMessage): ArrayBuffer[] | undefined => {
  if (isTransferableChunkTag(message._tag) && 'bytes' in message && message.bytes instanceof ArrayBuffer) {
    return [message.bytes];
  }
  if ((message._tag === 'HttpFetch' || message._tag === 'HttpFetchResult') && message.body instanceof ArrayBuffer) {
    return [message.body];
  }
  if ((message._tag === 'FsReadFileResult' || message._tag === 'FsWriteFile') && message.bytes instanceof ArrayBuffer) {
    return [message.bytes];
  }
  return undefined;
};

/** Encode `message` and post it on `port`, transferring its binary payload when it has one. */
export const postIpcMessage = (port: IpcPort, message: IpcMessage): void => {
  const encoded = encodeIpcMessage(message);
  const transfer = getIpcTransferList(message);
  if (transfer === undefined) {
    port.postMessage(encoded);
    return;
  }
  port.postMessage(encoded, transfer);
};

export const bytesToArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

export const unknownBytesToUint8Array = (bytes: unknown): Uint8Array => {
  if (bytes instanceof Uint8Array) {
    return bytes;
  }
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes);
  }
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return new Uint8Array();
};
