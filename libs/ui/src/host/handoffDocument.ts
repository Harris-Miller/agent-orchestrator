/** Handoff prompt text. The document itself arrives through the hub's `submit_handoff` tool, never by parsing replies. */

export const SOURCE_HANDOFF_PROMPT = `Write a handoff document summarizing the current conversation so a fresh agent can continue the work.

Include a "suggested skills" section in the document, naming which skills the next agent should call the Skill tool for.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

Deliver the document by calling the \`submit_handoff\` tool exactly once, passing the whole document as its \`document\` argument. Do not write the document in your reply.`;
