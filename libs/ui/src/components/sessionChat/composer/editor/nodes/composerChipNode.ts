import type { LexicalNode } from 'lexical';

import { $isComposerCommandNode, ComposerCommandNode } from './ComposerCommandNode.tsx';
import { $isComposerMarkdownLinkNode, ComposerMarkdownLinkNode } from './ComposerMarkdownLinkNode.tsx';
import { ComposerMarkdownTextNode } from './ComposerMarkdownTextNode.ts';
import { ComposerQuoteLineNode } from './ComposerQuoteLineNode.ts';

export const COMPOSER_NODES = [
  ComposerCommandNode,
  ComposerMarkdownLinkNode,
  ComposerMarkdownTextNode,
  ComposerQuoteLineNode,
];

export const $isComposerChipNode = (
  node: LexicalNode | null | undefined,
): node is ComposerCommandNode | ComposerMarkdownLinkNode =>
  $isComposerCommandNode(node) || $isComposerMarkdownLinkNode(node);
