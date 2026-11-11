import { Effect } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { appendRequestError } from '../host/harnessStateTransitions.ts';
import { isAcpError } from '../host/requestError.ts';

import { updateHarnessSnapshot } from './harnessSnapshot.ts';

/**
 * Show the Agent's error response to `method` in the Session's chat (glossary: Request error) instead of failing: the
 * effect then succeeds with `undefined`. Every other failure, transport ones included, passes through.
 */
export const reportRequestError =
  (
    registry: AtomRegistry.AtomRegistry,
    { launchTarget, sessionId }: { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string },
    method: string,
  ) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A | undefined, E, R> =>
    effect.pipe(
      Effect.catch((error): Effect.Effect<undefined, E> =>
        isAcpError(error)
          ? Effect.sync(() => {
              updateHarnessSnapshot(registry, launchTarget, current =>
                appendRequestError(current, sessionId, { error, method }),
              );
              return undefined;
            })
          : Effect.fail(error),
      ),
    );
