/** Display-only sanitizers for chat markdown (session/load echoes). */

const EMBEDDED_CONTEXT_BLOCK_RE = /\n*<context\b[^>]*>[\s\S]*?<\/context>\n*/gi;
const SYSTEM_REMINDER_BLOCK_RE = /\n*<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>\n*/gi;
const SUBAGENT_REPORT_BLOCK_RE = /\n*<subagent-report\b[^>]*>[\s\S]*?<\/subagent-report>\n*/gi;
const IDE_SELECTION_BLOCK_RE = /\n*<ide_selection\b[^>]*>[\s\S]*?<\/ide_selection>\n*/gi;

const collapseInnerSpaces = (text: string): string => text.replace(/ {2,}/g, ' ');

/**
 * Replace each context block (tags + body + adjacent newlines) with a single space
 * so reloaded prompts stay one readable sentence.
 */
export const stripEmbeddedContextBlocks = (text: string): string =>
  collapseInnerSpaces(text.replace(EMBEDDED_CONTEXT_BLOCK_RE, ' '));

/**
 * Hide agent-injected `<system-reminder>` blocks (e.g. Claude scratch-workspace
 * instructions echoed on `user_message_chunk`) from the chat UI.
 */
export const stripSystemReminderBlocks = (text: string): string =>
  collapseInnerSpaces(text.replace(SYSTEM_REMINDER_BLOCK_RE, ' ')).trim();

/**
 * Hide IDE-injected `<ide_selection>` blocks (Cursor/Claude selection context
 * echoed on `user_message_chunk`) from the chat UI.
 */
export const stripIdeSelectionBlocks = (text: string): string =>
  collapseInnerSpaces(text.replace(IDE_SELECTION_BLOCK_RE, ' ')).trim();

/**
 * Hide Harness-sent `<subagent-report>` blocks (a Spawned subagent's result delivered to its parent as a message; the
 * Subagent chat-line already shows it) from the chat UI.
 */
export const stripSubagentReportBlocks = (text: string): string =>
  collapseInnerSpaces(text.replace(SUBAGENT_REPORT_BLOCK_RE, ' ')).trim();

/** Strip embedded context / system-reminder / ide_selection / subagent-report bodies for ChatMarkdown (FS mention labels keep `@`). */
export const prepareChatMarkdownText = (text: string): string =>
  stripSubagentReportBlocks(stripIdeSelectionBlocks(stripSystemReminderBlocks(stripEmbeddedContextBlocks(text))));
