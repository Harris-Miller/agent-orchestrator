import { $applyNodeReplacement, DecoratorNode } from 'lexical';
import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import type { JSX } from 'react';

export type SerializedComposerMarkdownLinkNode = Spread<
  {
    readonly href: string;
    readonly label: string;
  },
  SerializedLexicalNode
>;

export const markdownLinkText = (label: string, href: string): string => `[${label}](${href})`;

export class ComposerMarkdownLinkNode extends DecoratorNode<JSX.Element> {
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
    const span = document.createElement('span');
    span.className = 'composer-markdown-link-chip-host';
    return span;
  }

  decorate(): JSX.Element {
    return (
      <span className="composer-markdown-link-chip" contentEditable={false} data-testid="composer-markdown-link-chip">
        {this.__label}
      </span>
    );
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span');
    element.textContent = this.getTextContent();
    return { element };
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

  getTextContentSize(): number {
    return this.getTextContent().length;
  }

  isInline(): true {
    return true;
  }

  isIsolated(): true {
    return true;
  }

  isKeyboardSelectable(): true {
    return true;
  }

  updateDOM(): false {
    return false;
  }
}

export const $createComposerMarkdownLinkNode = (label: string, href: string): ComposerMarkdownLinkNode =>
  $applyNodeReplacement(new ComposerMarkdownLinkNode(label, href));

export const $isComposerMarkdownLinkNode = (node: LexicalNode | null | undefined): node is ComposerMarkdownLinkNode =>
  node instanceof ComposerMarkdownLinkNode;
