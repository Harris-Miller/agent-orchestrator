import { $applyNodeReplacement } from 'lexical';
import type { LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import type { JSX } from 'react';

import { ComposerChipContent } from '../../chips/ComposerChipContent.tsx';
import { ComposerChipDecoratorNode } from './ComposerChipDecoratorNode.ts';
import { markdownLinkText } from '../../chips/markdownLinkText.ts';

export type SerializedComposerMarkdownLinkNode = Spread<
  {
    readonly href: string;
    readonly label: string;
  },
  SerializedLexicalNode
>;

export class ComposerMarkdownLinkNode extends ComposerChipDecoratorNode {
  __href: string;
  __label: string;

  constructor(label: string, href: string, key?: NodeKey) {
    super(key);
    this.__href = href;
    this.__label = label;
  }

  static clone(node: ComposerMarkdownLinkNode): ComposerMarkdownLinkNode {
    return new ComposerMarkdownLinkNode(node.__label, node.__href, node.__key);
  }

  static getType(): string {
    return 'composer-markdown-link';
  }

  static importJSON(serializedNode: SerializedComposerMarkdownLinkNode): ComposerMarkdownLinkNode {
    return new ComposerMarkdownLinkNode(serializedNode.label, serializedNode.href);
  }

  createDOM(): HTMLElement {
    return this.createChipHostDom('composer-markdown-link-chip-host');
  }

  decorate(): JSX.Element {
    return (
      <ComposerChipContent
        className="composer-markdown-link-chip"
        href={this.__href}
        kind="markdownLink"
        label={this.__label}
        testId="composer-markdown-link-chip"
      />
    );
  }

  exportJSON(): SerializedComposerMarkdownLinkNode {
    return {
      ...super.exportJSON(),
      href: this.__href,
      label: this.__label,
    };
  }

  getHref(): string {
    return this.getLatest().__href;
  }

  getLabel(): string {
    return this.getLatest().__label;
  }

  getTextContent(): string {
    return markdownLinkText(this.getLabel(), this.getHref());
  }
}

export const $createComposerMarkdownLinkNode = (label: string, href: string): ComposerMarkdownLinkNode =>
  $applyNodeReplacement(new ComposerMarkdownLinkNode(label, href));

export const $isComposerMarkdownLinkNode = (node: LexicalNode | null | undefined): node is ComposerMarkdownLinkNode =>
  node instanceof ComposerMarkdownLinkNode;
