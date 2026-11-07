import { OS } from '@lib/context-services';
import { Effect, Layer } from 'effect';

import type { IpcClient } from './protocol/ipcClient.ts';

/** Pull OS snapshot once over IPC, then expose sync getters. */
export const makeOsSnapshotLive = (client: IpcClient): Layer.Layer<OS> =>
  Layer.effect(
    OS,
    Effect.gen(function* () {
      const response = yield* client.request({ _tag: 'OsSnapshot' }).pipe(Effect.orDie);
      const snapshot = {
        arch: response.arch,
        cwd: response.cwd,
        env: response.env,
        homedir: response.homedir,
        platform: response.platform,
      };
      return {
        arch: () => snapshot.arch,
        cwd: () => snapshot.cwd,
        env: () => snapshot.env,
        homedir: () => snapshot.homedir,
        platform: () => snapshot.platform,
      };
    }),
  );
