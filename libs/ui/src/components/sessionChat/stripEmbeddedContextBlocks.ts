/** Display-only sanitizers for chat markdown (session/load echoes). */

const EMBEDDED_CONTEXT_BLOCK_RE = /\n*<context\b[^>]*>[\s\S]*?<\/context>\n*/gi;

/**
 * Replace each context block (tags + body + adjacent newlines) with a single space
 * so reloaded prompts stay one readable sentence.
 */
export const stripEmbeddedContextBlocks = (text: string): string =>
  text.replace(EMBEDDED_CONTEXT_BLOCK_RE, ' ').replace(/ {2,}/g, ' ');

/** Strip embedded context bodies for ChatMarkdown (FS mention labels keep `@`). */
export const prepareChatMarkdownText = (text: string): string => stripEmbeddedContextBlocks(text);
