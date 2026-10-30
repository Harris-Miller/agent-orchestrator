import { ANTIGRAVITY_NOT_SIGNED_IN } from './backendHarness.ts';

/** True when bootstrap error is the Antigravity unsigned remap (Sign in CTA). */
export const isAntigravitySignInError = (error: string | undefined): boolean => error === ANTIGRAVITY_NOT_SIGNED_IN;
