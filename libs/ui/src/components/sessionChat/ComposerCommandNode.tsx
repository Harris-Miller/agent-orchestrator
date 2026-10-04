import { $applyNodeReplacement, DecoratorNode } from 'lexical';
import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import type { JSX } from 'react';

import { ComposerChipContent } from './ComposerChipContent.tsx';

export type SerializedComposerCommandNode = Spread<
  {
    readonly invocation: string;
  },
  SerializedLexicalNode
>;

export class ComposerCommandNode extends DecoratorNode<JSX.Element> {
  __invocation: string;

  constructor(invocation: string, key?: NodeKey) {
    super(key);
    this.__invocation = invocation;
  }

  static clone(node: ComposerCommandNode): ComposerCommandNode {
    return new ComposerCommandNode(node.__invocation, node.__key);
  }

  static getType(): string {
    return 'composer-command';
  }

  static importJSON(serializedNode: SerializedComposerCommandNode): ComposerCommandNode {
    return new ComposerCommandNode(serializedNode.invocation);
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'composer-command-chip-host';
    return span;
  }

  decorate(): JSX.Element {
    return (
      <ComposerChipContent
        className="composer-command-chip"
        kind="command"
        label={this.__invocation}
        testId="composer-command-chip"
      />
    );
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span');
    element.textContent = this.__invocation;
    return { element };
  }

  exportJSON(): SerializedComposerCommandNode {
    return {
      ...super.exportJSON(),
      invocation: this.__invocation,
    };
  }

  getInvocation(): string {
    return this.getLatest().__invocation;
  }

  getTextContent(): string {
    return this.getInvocation();
  }

  getTextContentSize(): number {
    return this.getInvocation().length;
  }

  isInline(): true {
    return true;
  }

  // false: adjacent Backspace/Delete must remove the whole chip (Lexical skips isolated decorators).
  isIsolated(): false {
    return false;
  }

  isKeyboardSelectable(): true {
    return true;
  }

  updateDOM(): false {
    return false;
  }
}

export const $createComposerCommandNode = (invocation: string): ComposerCommandNode =>
  $applyNodeReplacement(new ComposerCommandNode(invocation));

export const $isComposerCommandNode = (node: LexicalNode | null | undefined): node is ComposerCommandNode =>
  node instanceof ComposerCommandNode;
