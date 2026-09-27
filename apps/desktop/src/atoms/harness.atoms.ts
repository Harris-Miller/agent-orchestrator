/** Desktop-bound ACP backend harness lifecycle Atoms. */
import { createHarnessAtoms } from '@lib/ui';

import {
  atomRuntime,
  hostRun,
  hostRunFork,
  hostRunPromise,
  hostRunPromiseExit,
  hostRuntime,
} from '../createHostRuntime.ts';

export const { backendHarnessAtom, restartBackendAtomFn } = createHarnessAtoms({
  atomRuntime,
  hostRun,
  hostRunFork,
  hostRunPromise,
  hostRunPromiseExit,
  hostRuntime,
});
