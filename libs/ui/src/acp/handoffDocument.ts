/** Handoff prompt text and extraction from chat items. */

import type { ChatItem } from './sessionUpdateReducer.ts';

export const SOURCE_HANDOFF_PROMPT = `Write a handoff document summarizing the current conversation so a fresh agent can continue the work.

Include a "suggested skills" section in the document, naming which skills the next agent should call the Skill tool for.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

All of the above should be written out in between <handoff> and </handoff> tags.`;

const HANDOFF_TAG_RE = /<handoff>([\s\S]*?)<\/handoff>/i;

export const buildTargetHandoffSeedPrompt = (handoffDocument: string): string =>
  `Here is a handoff document from a previous agent chat:

<handoff>
${handoffDocument}
</handoff>

Review it and then ask the user what they would like to do next.`;

/** Last agent_message text, preferring inner <handoff>…</handoff> content when present. */
export const extractHandoffDocument = (chatItems: readonly ChatItem[]): string | undefined => {
  let lastAgentText: string | undefined;
  for (const item of chatItems) {
    if (item.kind === 'agent_message') {
      lastAgentText = item.text;
    }
  }

  if (lastAgentText === undefined) {
    return undefined;
  }

  const trimmed = lastAgentText.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const match = HANDOFF_TAG_RE.exec(trimmed);
  if (match?.[1] !== undefined) {
    const inner = match[1].trim();
    return inner.length > 0 ? inner : undefined;
  }

  return trimmed;
};
