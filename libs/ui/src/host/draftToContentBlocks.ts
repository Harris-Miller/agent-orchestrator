/**
 * Map a composer draft string to an ordered ACP `prompt` ContentBlock list.
 *
 * FS markdown links become `resource` / `resource_link`; everything else stays in `text`.
 * Image `resource_link`s (attachments and image FS links) are moved to the end and de-duplicated by uri.
 */
import type { ContentBlock } from '@libs/effect-acp';
import { ByteSize, Effect, Option } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

import { isRecord } from '../isRecord.ts';

import { normalizeInitialize } from './acpSessionBootstrap.ts';
import {
  attachmentToResourceLinkBlock,
  isImageLikeResourceLink,
  validateImageAttachments,
} from './composerImageAttachment.ts';
import type { ComposerImageAttachment } from './composerImageAttachment.ts';

export const TEXT_EMBED_MAX_BYTES = 256 * 1024;
export const BLOB_EMBED_MAX_BYTES = 1024 * 1024;

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const WINDOWS_ABS_RE = /^[A-Za-z]:[\\/]/;
const URI_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export type DraftToContentBlocksOptions = {
  readonly cwd: string;
  readonly embeddedContext: boolean;
};

export type MarkdownLinkMatch = {
  readonly end: number;
  readonly href: string;
  readonly label: string;
  readonly start: number;
};

export const findMarkdownLinks = (text: string): readonly MarkdownLinkMatch[] => {
  const matches: MarkdownLinkMatch[] = [];
  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const start = match.index;
    matches.push({
      end: start + match[0].length,
      href: match[2],
      label: match[1],
      start,
    });
  }
  return matches;
};

const hasPromptCapability = (initializeResult: unknown, path: string, rawKey: string): boolean => {
  const normalized = normalizeInitialize(initializeResult);
  if (normalized?.capabilities.some(capability => capability.path === path && capability.enabled) === true) {
    return true;
  }

  if (!isRecord(initializeResult) || !isRecord(initializeResult.agentCapabilities)) {
    return false;
  }
  const { promptCapabilities } = initializeResult.agentCapabilities;
  return isRecord(promptCapabilities) && promptCapabilities[rawKey] === true;
};

/** True when initialize advertises `promptCapabilities.embeddedContext`. */
export const hasEmbeddedContextCapability = (initializeResult: unknown): boolean =>
  hasPromptCapability(initializeResult, 'promptCapabilities.embeddedContext', 'embeddedContext');

/** Drop later `resource_link` blocks that share a `uri` with an earlier one (first wins). */
export const dedupeResourceLinksByUri = (blocks: readonly ContentBlock[]): ContentBlock[] => {
  const seen = new Set<string>();
  const out: ContentBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'resource_link') {
      if (!seen.has(block.uri)) {
        seen.add(block.uri);
        out.push(block);
      }
    } else {
      out.push(block);
    }
  }
  return out;
};

const textBlock = (text: string): ContentBlock => ({ text, type: 'text' });

const resourceLinkBlock = (uri: string, name: string): ContentBlock => ({ name, type: 'resource_link', uri });

const resourceTextBlock = (uri: string, text: string): ContentBlock => ({ resource: { text, uri }, type: 'resource' });

const resourceBlobBlock = (uri: string, blob: string): ContentBlock => ({ resource: { blob, uri }, type: 'resource' });

/** True for filesystem hrefs (absolute, relative, or `file://`); false for other URI schemes. */
export const isFileSystemHref = (href: string): boolean => {
  if (href.startsWith('file://')) {
    return true;
  }
  if (href.startsWith('/') || WINDOWS_ABS_RE.test(href)) {
    return true;
  }
  if (URI_SCHEME_RE.test(href)) {
    return false;
  }
  return href.length > 0;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const decodeUtf8Text = (bytes: Uint8Array): string | undefined => {
  if (bytes.includes(0)) {
    return undefined;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
};

const basenameForName = (pathApi: Path, absolutePath: string): string => {
  const trimmed = absolutePath.replace(/[/\\]+$/, '');
  const base = pathApi.basename(trimmed);
  return base.length > 0 ? base : trimmed;
};

const resolveHrefPath = Effect.fn('draftToContentBlocks.resolveHrefPath')(function* (href: string, cwd: string) {
  const pathApi = yield* Path;

  if (href.startsWith('file://')) {
    const absolute = yield* pathApi.fromFileUrl(new URL(href)).pipe(Effect.option);
    return Option.isSome(absolute) ? absolute.value : undefined;
  }

  const hrefIsDir = href.endsWith('/') || href.endsWith('\\');
  const withoutTrailing = hrefIsDir ? href.replace(/[/\\]+$/, '') : href;
  const absolute = pathApi.isAbsolute(withoutTrailing)
    ? pathApi.normalize(withoutTrailing)
    : pathApi.resolve(cwd, withoutTrailing);

  return hrefIsDir ? `${absolute}${pathApi.sep}` : absolute;
});

const linkToBlock = Effect.fn('draftToContentBlocks.linkToBlock')(function* (
  href: string,
  options: DraftToContentBlocksOptions,
) {
  const pathApi = yield* Path;
  const fs = yield* FileSystem;

  const resolved = yield* resolveHrefPath(href, options.cwd);
  if (resolved === undefined) {
    return undefined;
  }

  const trailingDir = resolved.endsWith('/') || resolved.endsWith('\\') || href.endsWith('/') || href.endsWith('\\');
  const absolutePath = trailingDir ? resolved.replace(/[/\\]+$/, '') : resolved;
  const name = basenameForName(pathApi, absolutePath);
  const fileUrl = yield* pathApi.toFileUrl(absolutePath).pipe(Effect.option);
  if (Option.isNone(fileUrl)) {
    return undefined;
  }
  const uri = fileUrl.value.href;

  if (trailingDir) {
    const exists = yield* fs.exists(absolutePath).pipe(Effect.orElseSucceed(() => false));
    return exists ? resourceLinkBlock(uri, name) : undefined;
  }

  const info = yield* fs.stat(absolutePath).pipe(Effect.option);
  if (Option.isNone(info)) {
    return undefined;
  }

  if (info.value.type === 'Directory') {
    return resourceLinkBlock(uri, name);
  }

  if (info.value.type !== 'File') {
    return resourceLinkBlock(uri, name);
  }

  if (!options.embeddedContext) {
    return resourceLinkBlock(uri, name);
  }

  const size = ByteSize.toNumberUnsafe(info.value.size);
  if (!Number.isFinite(size) || size > BLOB_EMBED_MAX_BYTES) {
    return resourceLinkBlock(uri, name);
  }

  const bytes = yield* fs.readFile(absolutePath).pipe(Effect.option);
  if (Option.isNone(bytes)) {
    return resourceLinkBlock(uri, name);
  }

  const text = decodeUtf8Text(bytes.value);
  if (text === undefined) {
    return resourceLinkBlock(uri, name);
  }

  if (bytes.value.byteLength <= TEXT_EMBED_MAX_BYTES) {
    return resourceTextBlock(uri, text);
  }

  return resourceBlobBlock(uri, bytesToBase64(bytes.value));
});

export const draftToContentBlocks = Effect.fn('draftToContentBlocks')(function* (
  draft: string,
  options: DraftToContentBlocksOptions,
) {
  const links = findMarkdownLinks(draft);
  const blocks: ContentBlock[] = [];
  let textBuffer = '';
  let cursor = 0;

  const flushText = () => {
    if (textBuffer.length === 0) {
      return;
    }
    blocks.push(textBlock(textBuffer));
    textBuffer = '';
  };

  for (const link of links) {
    if (link.start > cursor) {
      textBuffer += draft.slice(cursor, link.start);
    }

    const original = draft.slice(link.start, link.end);
    if (!isFileSystemHref(link.href)) {
      textBuffer += original;
    } else {
      const block = yield* linkToBlock(link.href, options);
      if (block === undefined) {
        textBuffer += original;
      } else {
        flushText();
        blocks.push(block);
      }
    }

    cursor = link.end;
  }

  if (cursor < draft.length) {
    textBuffer += draft.slice(cursor);
  }
  flushText();

  if (blocks.length === 0 && draft.length === 0) {
    return [textBlock('')];
  }

  return blocks;
});

/**
 * ContentBlock[] for `session/prompt` from composer draft — same path as send.
 * No cwd → plain text block (send cannot resolve FS links); image attaches still append when present.
 * Image `resource_link`s (draft markdown or attachments) always go at the end; all `resource_link`s
 * are de-duplicated by `uri` (first wins). Empty text + images → resource_link-only (no empty text).
 */
export const promptBlocksFromComposerDraft = Effect.fn('promptBlocksFromComposerDraft')(function* (
  text: string,
  options: {
    readonly attachments?: readonly ComposerImageAttachment[];
    readonly cwd: string | undefined;
    readonly initializeResult: unknown;
  },
) {
  const attachments = options.attachments ?? [];
  if (attachments.length > 0) {
    yield* validateImageAttachments(attachments);
  }

  const draftBlocks =
    options.cwd === undefined
      ? [textBlock(text)]
      : yield* draftToContentBlocks(text, {
          cwd: options.cwd,
          embeddedContext: hasEmbeddedContextCapability(options.initializeResult),
        });

  const body: ContentBlock[] = [];
  const draftImageLinks: ContentBlock[] = [];
  for (const block of draftBlocks) {
    if (isImageLikeResourceLink(block)) {
      draftImageLinks.push(block);
    } else {
      body.push(block);
    }
  }

  const endImageLinks = [...attachments.map(attachmentToResourceLinkBlock), ...draftImageLinks];
  if (endImageLinks.length === 0) {
    return dedupeResourceLinksByUri(draftBlocks);
  }

  const trimmedEmpty = text.trim().length === 0;
  const onlyEmptyText = trimmedEmpty && body.length === 1 && body[0]?.type === 'text' && body[0].text === '';

  const combined = onlyEmptyText ? endImageLinks : [...body, ...endImageLinks];
  return dedupeResourceLinksByUri(combined);
});
