import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

import type { IpcClient } from './protocol/ipcClient.ts';
import { bytesToArrayBuffer, unknownBytesToUint8Array } from './protocol/messages.ts';

const bodyInitFromUnknown = (body: unknown): ArrayBuffer | null => {
  if (body instanceof ArrayBuffer) {
    return body.byteLength > 0 ? body : null;
  }
  const bytes = unknownBytesToUint8Array(body);
  return bytes.byteLength > 0 ? bytesToArrayBuffer(bytes) : null;
};

/**
 * Overrides Effect's {@link FetchHttpClient.Fetch} with extension-host `fetch`
 * over IPC so OTLP (and any other FetchHttpClient traffic) skips webview CORS.
 */
export const makeExtensionFetchLive = (client: IpcClient): Layer.Layer<never> =>
  Layer.succeed(FetchHttpClient.Fetch, async (input, init) => {
    try {
      return await Effect.runPromise(
        Effect.gen(function* () {
          const request = new Request(input, init);
          const headers: Record<string, string> = {};
          request.headers.forEach((value, key) => {
            headers[key] = value;
          });
          const bodyAb = yield* Effect.promise(async () => {
            if (request.method === 'GET' || request.method === 'HEAD') {
              return undefined;
            }
            const buf = await request.arrayBuffer();
            return buf.byteLength > 0 ? buf : undefined;
          });
          const response = yield* client.request({
            _tag: 'HttpFetch',
            body: bodyAb,
            headers,
            method: request.method,
            url: request.url,
          });
          return new Response(response.body !== undefined ? bodyInitFromUnknown(response.body) : null, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText,
          });
        }),
      );
    } catch (cause) {
      throw new TypeError(cause instanceof Error ? cause.message : String(cause));
    }
  });
