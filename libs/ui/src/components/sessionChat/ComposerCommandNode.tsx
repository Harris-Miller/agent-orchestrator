import { $applyNodeReplacement } from 'lexical';
import type { LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical';
import type { JSX } from 'react';

import { ComposerChipContent } from './ComposerChipContent.tsx';
import { ComposerChipDecoratorNode } from './ComposerChipDecoratorNode.ts';

export type SerializedComposerCommandNode = Spread<
  {
    readonly invocation: string;
  },
  SerializedLexicalNode
>;

export class ComposerCommandNode extends ComposerChipDecoratorNode {
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
    return this.createChipHostDom('composer-command-chip-host');
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
}

export const $createComposerCommandNode = (invocation: string): ComposerCommandNode =>
  $applyNodeReplacement(new ComposerCommandNode(invocation));

export const $isComposerCommandNode = (node: LexicalNode | null | undefined): node is ComposerCommandNode =>
  node instanceof ComposerCommandNode;
