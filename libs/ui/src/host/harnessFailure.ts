/**
 * Structured harness failure carried from the ACP harness to the provider views.
 * Classification is decided at the producing boundary, never by matching the user-facing text.
 */

export type HarnessFailure = {
  readonly _tag: 'Failed' | 'NotSignedIn';
  readonly message: string;
};

/** True when the provider is simply not signed in (the message is sign-in instructions). */
export const isNotSignedIn = (failure: HarnessFailure | undefined): boolean => failure?._tag === 'NotSignedIn';
