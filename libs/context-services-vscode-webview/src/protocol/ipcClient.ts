import { Effect, Schema } from 'effect';

import { decodeIpcMessage, postIpcMessage, resultTagOf, unknownBytesToUint8Array } from './messages.ts';
import type {
  HandleId,
  HostIpcRequestInput,
  HostIpcRequestTag,
  HostIpcResult,
  IpcMessage,
  WebviewPush,
} from './messages.ts';
import type { IpcPort } from './port.ts';
import type { WorkspaceFolders } from './workspaceFoldersIpc.ts';

export class IpcClientError extends Schema.TaggedError<IpcClientError>()('IpcClientError', {
  cause: Schema.optional(Schema.Unknown),
  message: Schema.String,
}) {}

type Pending = {
  readonly requestTag: HostIpcRequestTag;
  readonly resume: (effect: Effect.Effect<IpcMessage, IpcClientError>) => void;
};

type ProcessListeners = {
  readonly onExit: (code: number) => void;
  readonly onStderrChunk: (chunk: Uint8Array) => void;
  readonly onStderrEnd: () => void;
  readonly onStdoutChunk: (chunk: Uint8Array) => void;
  readonly onStdoutEnd: () => void;
};

type ProcessNotification = Extract<
  IpcMessage,
  { readonly _tag: 'Exit' | 'StderrChunk' | 'StderrEnd' | 'StdoutChunk' | 'StdoutEnd' }
>;

const PROCESS_NOTIFICATION_TAGS: ReadonlySet<ProcessNotification['_tag']> = new Set([
  'Exit',
  'StderrChunk',
  'StderrEnd',
  'StdoutChunk',
  'StdoutEnd',
]);

const isProcessNotification = (message: IpcMessage): message is ProcessNotification =>
  PROCESS_NOTIFICATION_TAGS.has(message._tag as ProcessNotification['_tag']);

type WorkspaceFoldersChangedListener = (folders: WorkspaceFolders) => void;

/**
 * Request/response + process notification demux over an {@link IpcPort}.
 */
export class IpcClient {
  private readonly disposeListen: () => void;
  private nextId = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly port: IpcPort;
  private readonly processes = new Map<HandleId, ProcessListeners>();
  private readonly workspaceFoldersChangedListeners = new Set<WorkspaceFoldersChangedListener>();

  public constructor(port: IpcPort) {
    this.port = port;
    this.disposeListen = port.onMessage((raw, transfer) => {
      this.onPortMessage(raw, transfer);
    });
  }

  public readonly dispose = (): void => {
    this.disposeListen();
    for (const [, pending] of this.pending) {
      pending.resume(Effect.fail(new IpcClientError({ message: 'IpcClient disposed' })));
    }
    this.pending.clear();
    this.processes.clear();
    this.workspaceFoldersChangedListeners.clear();
  };

  /**
   * Multicast subscribe for unsolicited {@link WorkspaceFoldersChanged} pushes.
   * Returns dispose; does not replace other listeners.
   */
  public readonly onWorkspaceFoldersChanged = (listener: WorkspaceFoldersChangedListener): (() => void) => {
    this.workspaceFoldersChangedListeners.add(listener);
    return () => {
      this.workspaceFoldersChangedListeners.delete(listener);
    };
  };

  /** Send a **Host IPC push** (no reply). Requests go through {@link IpcClient.request}. */
  public readonly post = (message: WebviewPush): void => {
    postIpcMessage(this.port, message);
  };

  public readonly registerProcess = (handleId: HandleId, listeners: ProcessListeners): void => {
    this.processes.set(handleId, listeners);
  };

  /**
   * Send a **Host IPC request** and wait for its Result (same `id`). An `Error` reply, any other reply
   * tag, a post failure or {@link IpcClient.dispose} fail with {@link IpcClientError}.
   */
  public readonly request = <T extends HostIpcRequestTag>(
    message: HostIpcRequestInput<T>,
  ): Effect.Effect<HostIpcResult<T>, IpcClientError> =>
    Effect.callback<HostIpcResult<T>, IpcClientError>(resume => {
      const id = this.allocateCorrelationId();
      this.pending.set(id, {
        requestTag: message._tag,
        resume: resume as Pending['resume'],
      });
      try {
        postIpcMessage(this.port, { ...message, id } as IpcMessage);
      } catch (cause) {
        this.pending.delete(id);
        resume(
          Effect.fail(
            new IpcClientError({
              cause,
              message: cause instanceof Error ? cause.message : String(cause),
            }),
          ),
        );
      }
    });

  public readonly unregisterProcess = (handleId: HandleId): void => {
    this.processes.delete(handleId);
  };

  private readonly allocateCorrelationId = (): string => {
    this.nextId += 1;
    return `c-${this.nextId}`;
  };

  private readonly onPortMessage = (raw: unknown, _transfer: readonly ArrayBuffer[] | undefined): void => {
    let message: IpcMessage;
    try {
      message = decodeIpcMessage(raw);
    } catch {
      return;
    }

    if (isProcessNotification(message)) {
      const listeners = this.processes.get(message.handleId);
      switch (message._tag) {
        case 'Exit':
          listeners?.onExit(message.code);
          break;
        case 'StderrChunk':
          listeners?.onStderrChunk(unknownBytesToUint8Array(message.bytes));
          break;
        case 'StderrEnd':
          listeners?.onStderrEnd();
          break;
        case 'StdoutChunk':
          listeners?.onStdoutChunk(unknownBytesToUint8Array(message.bytes));
          break;
        case 'StdoutEnd':
          listeners?.onStdoutEnd();
          break;
      }
      return;
    }

    if (message._tag === 'WorkspaceFoldersChanged') {
      for (const listener of this.workspaceFoldersChangedListeners) {
        listener(
          message.workspaceFile === undefined
            ? { paths: message.paths }
            : { paths: message.paths, workspaceFile: message.workspaceFile },
        );
      }
      return;
    }

    if (!('id' in message)) {
      return;
    }
    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    this.pending.delete(message.id);
    if (message._tag === 'Error') {
      pending.resume(Effect.fail(new IpcClientError({ message: message.message })));
      return;
    }
    if (message._tag !== resultTagOf(pending.requestTag)) {
      pending.resume(
        Effect.fail(new IpcClientError({ message: `Unexpected ${pending.requestTag} response: ${message._tag}` })),
      );
      return;
    }
    pending.resume(Effect.succeed(message));
  };
}
