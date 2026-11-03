/** User-facing "sign in with the vendor CLI" messages, shared by the launch prerequisite and bootstrap failures. */
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import type { HarnessFailure } from './harnessFailure.ts';

export type VendorAuthLaunchTarget = 'claude-agent-acp' | 'codex-acp' | 'cursor-acp';

export const isVendorAuthLaunchTarget = (launchTarget: AgentLaunchTarget): launchTarget is VendorAuthLaunchTarget =>
  launchTarget === 'claude-agent-acp' || launchTarget === 'codex-acp' || launchTarget === 'cursor-acp';

export const notAuthenticatedMessage = (launchTarget: VendorAuthLaunchTarget): string => {
  switch (launchTarget) {
    case 'claude-agent-acp':
      return '`claude` is not authenticated — run `claude` and log in';
    case 'codex-acp':
      return '`codex` is not authenticated — run `codex login`';
    case 'cursor-acp':
      return '`cursor-agent` is not authenticated — run `cursor-agent login`';
  }
};

/** Phrases an adapter / CLI uses when the user simply is not signed in (narrow: ordinary errors must survive). */
const looksLikeVendorAuthFailure = (message: string): boolean =>
  /not (logged|signed) in|not authenticated|login required|sign[- ]?in required|auth(entication)?[ _-]?required/i.test(
    message,
  );

/** Classify adapter / CLI text at the wire boundary: sign-in failures become instructions, everything else survives. */
export const classifyVendorAuthFailure = (launchTarget: AgentLaunchTarget, message: string): HarnessFailure =>
  isVendorAuthLaunchTarget(launchTarget) && looksLikeVendorAuthFailure(message)
    ? { _tag: 'NotSignedIn', message: notAuthenticatedMessage(launchTarget) }
    : { _tag: 'Failed', message };
