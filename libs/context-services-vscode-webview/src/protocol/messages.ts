import { Base64Image } from '@lib/context-services';
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
  AppExit: {
    id: CorrelationId,
  },
  AppExitResult: {
    id: CorrelationId,
  },
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
  FileDialogPickFiles: {
    filters: Schema.optional(
      Schema.Array(
        Schema.Struct({
          extensions: Schema.Array(Schema.String),
          name: Schema.String,
        }),
      ),
    ),
    id: CorrelationId,
    multiple: Schema.optional(Schema.Boolean),
  },
  FileDialogPickFilesResult: {
    id: CorrelationId,
    paths: Schema.Array(Schema.String),
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
  FsReadFile: {
    id: CorrelationId,
    path: Schema.String,
  },
  FsReadFileResult: {
    /** Binary file payload (`ArrayBuffer`); may be transferred via postMessage. */
    bytes: Schema.Unknown,
    id: CorrelationId,
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
  FsStat: {
    id: CorrelationId,
    path: Schema.String,
  },
  FsStatResult: {
    atime: Schema.optional(Schema.Number),
    birthtime: Schema.optional(Schema.Number),
    id: CorrelationId,
    mtime: Schema.optional(Schema.Number),
    size: Schema.Number,
    type: Schema.Literals(['Directory', 'File', 'SymbolicLink', 'Unknown']),
  },
  FsWriteFileString: {
    content: Schema.String,
    id: CorrelationId,
    path: Schema.String,
  },
  FsWriteFileStringResult: {
    id: CorrelationId,
  },
  HttpFetch: {
    /** Optional request body (`ArrayBuffer`); may be transferred via postMessage. */
    body: Schema.optional(Schema.Unknown),
    headers: Schema.Record(Schema.String, Schema.String),
    id: CorrelationId,
    method: Schema.String,
    url: Schema.String,
  },
  HttpFetchResult: {
    /** Optional response body (`ArrayBuffer`); may be transferred via postMessage. */
    body: Schema.optional(Schema.Unknown),
    headers: Schema.Record(Schema.String, Schema.String),
    id: CorrelationId,
    status: Schema.Number,
    statusText: Schema.String,
  },
  Kill: {
    handleId: HandleId,
    id: CorrelationId,
  },
  KillResult: {
    id: CorrelationId,
  },
  OpenUrl: {
    id: CorrelationId,
    url: Schema.String,
  },
  OpenUrlResult: {
    id: CorrelationId,
  },
  OpenFile: {
    id: CorrelationId,
    path: Schema.String,
  },
  OpenImageData: {
    ...Base64Image.fields,
    id: CorrelationId,
  },
  OpenImageDataResult: {
    id: CorrelationId,
  },
  OpenFileResult: {
    id: CorrelationId,
  },
  OsSnapshot: {
    id: CorrelationId,
  },
  OsSnapshotResult: {
    arch: Schema.String,
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
  WorkspaceFolders: {
    id: CorrelationId,
  },
  WorkspaceFoldersChanged: {
    paths: Schema.Array(Schema.String),
  },
  WorkspaceFoldersResult: {
    id: CorrelationId,
    paths: Schema.Array(Schema.String),
  },
});
export type IpcMessage = typeof IpcMessage.Type;

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
  if (message._tag === 'FsReadFileResult' && message.bytes instanceof ArrayBuffer) {
    return [message.bytes];
  }
  return undefined;
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
