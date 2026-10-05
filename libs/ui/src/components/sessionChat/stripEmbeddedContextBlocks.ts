/** Display-only sanitizers for chat markdown (session/load echoes). */

const EMBEDDED_CONTEXT_BLOCK_RE = /\n*<context\b[^>]*>[\s\S]*?<\/context>\n*/gi;
const SYSTEM_REMINDER_BLOCK_RE = /\n*<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>\n*/gi;

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

/** Strip embedded context / system-reminder bodies for ChatMarkdown (FS mention labels keep `@`). */
export const prepareChatMarkdownText = (text: string): string =>
  stripSystemReminderBlocks(stripEmbeddedContextBlocks(text));
