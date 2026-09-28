import { Schema } from 'effect';

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
 * Control + data-plane messages for extension↔webview IPC.
 * Data chunks may carry an `ArrayBuffer` transferred via `postMessage` transfer list.
 */
export const IpcMessage = Schema.TaggedUnion({
  BundledResolve: {
    id: CorrelationId,
    resourcePath: Schema.String,
  },
  BundledResolveResult: {
    id: CorrelationId,
    path: Schema.String,
  },
  Error: {
    id: CorrelationId,
    message: Schema.String,
  },
  Exit: {
    code: Schema.Number,
    handleId: HandleId,
  },
  FsExists: {
    id: CorrelationId,
    path: Schema.String,
  },
  FsExistsResult: {
    exists: Schema.Boolean,
    id: CorrelationId,
  },
  FsMakeDirectory: {
    id: CorrelationId,
    options: Schema.optional(MakeDirectoryOptions),
    path: Schema.String,
  },
  FsMakeDirectoryResult: {
    id: CorrelationId,
  },
  FsMakeTempDirectory: {
    id: CorrelationId,
    options: Schema.optional(MakeTempDirectoryOptions),
  },
  FsMakeTempDirectoryResult: {
    id: CorrelationId,
    path: Schema.String,
  },
  FsReadFileString: {
    id: CorrelationId,
    path: Schema.String,
  },
  FsReadFileStringResult: {
    content: Schema.String,
    id: CorrelationId,
  },
  FsRemove: {
    id: CorrelationId,
    options: Schema.optional(RemoveOptions),
    path: Schema.String,
  },
  FsRemoveResult: {
    id: CorrelationId,
  },
  FsWriteFileString: {
    content: Schema.String,
    id: CorrelationId,
    path: Schema.String,
  },
  FsWriteFileStringResult: {
    id: CorrelationId,
  },
  Kill: {
    handleId: HandleId,
    id: CorrelationId,
  },
  KillResult: {
    id: CorrelationId,
  },
  OsSnapshot: {
    id: CorrelationId,
  },
  OsSnapshotResult: {
    cwd: Schema.String,
    env: Schema.Record(Schema.String, Schema.String),
    homedir: Schema.String,
    id: CorrelationId,
    platform: Schema.String,
  },
  Spawn: {
    args: Schema.Array(Schema.String),
    command: Schema.String,
    id: CorrelationId,
    options: Schema.optional(SpawnOptions),
  },
  SpawnResult: {
    handleId: HandleId,
    id: CorrelationId,
    pid: Schema.Number,
  },
  StderrChunk: {
    /** Transferred byte payload (`ArrayBuffer`); validated loosely for postMessage. */
    bytes: Schema.Unknown,
    handleId: HandleId,
  },
  StderrEnd: {
    handleId: HandleId,
  },
  StdinChunk: {
    bytes: Schema.Unknown,
    handleId: HandleId,
  },
  StdinEnd: {
    handleId: HandleId,
  },
  StdoutChunk: {
    bytes: Schema.Unknown,
    handleId: HandleId,
  },
  StdoutEnd: {
    handleId: HandleId,
  },
});
export type IpcMessage = typeof IpcMessage.Type;

export const decodeIpcMessage = Schema.decodeUnknownSync(IpcMessage);
export const encodeIpcMessage = Schema.encodeSync(IpcMessage);

/** Message tags that carry a transferable `bytes` ArrayBuffer. */
export const isTransferableChunkTag = (tag: IpcMessage['_tag']): boolean =>
  tag === 'StdoutChunk' || tag === 'StderrChunk' || tag === 'StdinChunk';

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
