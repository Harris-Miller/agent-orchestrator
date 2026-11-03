/**
 * Structured harness failure carried from the ACP harness to the provider views.
 * Classification is decided at the producing boundary, never by matching the user-facing text.
 */

export type HarnessFailure = {
  readonly _tag: 'Failed' | 'NotSignedIn';
  readonly message: string;
};

/** An ordinary failure: the message is shown as an error, whatever its wording. */
export const harnessFailed = (message: string): HarnessFailure => ({ _tag: 'Failed', message });

/** The provider is simply not signed in; the message is sign-in instructions. */
export const harnessNotSignedIn = (message: string): HarnessFailure => ({ _tag: 'NotSignedIn', message });
