import { decodeIpcMessage, isHostIpcRequest, isWebviewPush, postIpcMessage, resultTagOf } from './messages.ts';
import type { HostIpcRequest, HostIpcRequestTag, HostIpcResultPayload, IpcMessage, WebviewPush } from './messages.ts';
import type { IpcPort } from './port.ts';

/**
 * Extension-side fulfillment: one handler per **Host IPC request** (resolve its Result payload, or
 * reject to answer `Error`) and per webview **Host IPC push**. Missing an entry is a type error.
 */
export type HostIpcFulfillment = {
  readonly [T in HostIpcRequestTag]: (request: HostIpcRequest<T>) => Promise<HostIpcResultPayload<T>>;
} & {
  readonly [T in WebviewPush['_tag']]: (push: Extract<WebviewPush, { readonly _tag: T }>) => void;
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Serve Host IPC requests and webview pushes arriving on `port` (the extension end of the seam;
 * {@link IpcClient} is the webview end). Each request gets exactly one reply: its Result, or `Error`
 * when the handler rejects or the Result cannot be posted. Anything else received is ignored.
 * Returns dispose (stops listening).
 */
export const serveHostIpc = (port: IpcPort, handlers: HostIpcFulfillment): (() => void) =>
  port.onMessage(raw => {
    let message: IpcMessage;
    try {
      message = decodeIpcMessage(raw);
    } catch {
      return;
    }

    if (isWebviewPush(message)) {
      const handle = handlers[message._tag] as (push: WebviewPush) => void;
      try {
        handle(message);
      } catch {
        // Pushes have no reply channel.
      }
      return;
    }

    if (!isHostIpcRequest(message)) {
      return;
    }

    const { _tag, id } = message;
    const handle = handlers[_tag] as (request: HostIpcRequest) => Promise<object>;
    const replyError = (error: unknown): void => {
      try {
        postIpcMessage(port, { _tag: 'Error', id, message: errorMessage(error) });
      } catch {
        // Port is gone; nobody is left to answer.
      }
    };
    new Promise<object>(resolve => {
      resolve(handle(message));
    }).then(payload => {
      try {
        postIpcMessage(port, { ...payload, _tag: resultTagOf(_tag), id } as IpcMessage);
      } catch (error) {
        replyError(error);
      }
    }, replyError);
  });
