/**
 * Antigravity oauth-personal Sign in helpers for the ACP harness bootstrap.
 */
import { OpenUrl } from '@lib/context-services';
import { Cause, Effect, Schema, Stream } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { parseAntigravityAuthUrlMarker } from './antigravityAuthUrl.ts';
import { isRecord } from '../isRecord.ts';
import { classifyVendorAuthFailure } from './authMessages.ts';
import type { HarnessFailure } from './harnessFailure.ts';

/** Sign in waited longer than {@link ANTIGRAVITY_SIGN_IN_TIMEOUT}. */
export class AntigravitySignInTimedOut extends Schema.TaggedError<AntigravitySignInTimedOut>()(
  'AntigravitySignInTimedOut',
  {
    message: Schema.String,
  },
) {}

export const ANTIGRAVITY_SIGN_IN_TIMEOUT = '5 minutes' as const;
export const ANTIGRAVITY_OAUTH_PERSONAL = 'oauth-personal';

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  // ACP wire errors arrive as a plain `AcpError` struct, not an `Error`.
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  return JSON.stringify(error);
};

const looksLikeAntigravityAuthFailure = (message: string): boolean =>
  /sign[- ]?in|authenticat|oauth|not (logged|signed) in|login required|unauthorized/i.test(message);

/** Classify a bootstrap `Cause` for the provider views; interrupts are not failures the user caused. */
export const classifyBootstrapFailure = (
  launchTarget: AgentLaunchTarget,
  cause: Cause.Cause<unknown>,
): HarnessFailure => {
  const message = formatError(Cause.squash(cause));
  if (launchTarget === 'antigravity-acp') {
    return looksLikeAntigravityAuthFailure(message) ? { _tag: 'NotSignedIn', message } : { _tag: 'Failed', message };
  }
  return classifyVendorAuthFailure(launchTarget, message);
};

/** Drain stderr for the auth-URL marker; open the first URL via Host OpenUrl. */
export const consumeAntigravityAuthStderr = Effect.fn('consumeAntigravityAuthStderr')(function* (
  stderr: Stream.Stream<Uint8Array, unknown>,
  onAntigravityAuthUrl: ((url: string) => void) | undefined,
) {
  const openUrl = yield* OpenUrl;
  const opened = { value: false };
  yield* stderr.pipe(
    Stream.decodeText(),
    Stream.splitLines,
    Stream.runForEach(line => {
      const url = parseAntigravityAuthUrlMarker(line);
      if (url === undefined || opened.value) {
        return Effect.void;
      }
      opened.value = true;
      onAntigravityAuthUrl?.(url);
      return openUrl.open(url).pipe(
        Effect.tapError(error => Effect.logWarning('OpenUrl failed during Antigravity Sign in', error.message)),
        Effect.ignore,
      );
    }),
  );
});
