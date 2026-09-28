import type { IpcPort } from './port.ts';

/**
 * In-memory duplex pair for fake-peer protocol tests.
 * Transfer lists are forwarded by reference (tests may still read the buffer).
 */
export const connectFakePeers = (): readonly [IpcPort, IpcPort] => {
  type Handler = (message: unknown, transfer?: readonly ArrayBuffer[]) => void;
  const aHandlers = new Set<Handler>();
  const bHandlers = new Set<Handler>();

  const makePort = (local: Set<Handler>, remote: Set<Handler>): IpcPort => ({
    onMessage: handler => {
      local.add(handler);
      return () => {
        local.delete(handler);
      };
    },
    postMessage: (message, transfer) => {
      for (const handler of remote) {
        handler(message, transfer);
      }
    },
  });

  return [makePort(aHandlers, bHandlers), makePort(bHandlers, aHandlers)] as const;
};
