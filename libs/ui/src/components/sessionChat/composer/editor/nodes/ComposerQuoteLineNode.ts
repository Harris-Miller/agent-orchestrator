import { $create, ElementNode } from 'lexical';
import type { LexicalNode } from 'lexical';

/**
 * One quote line (its `>` marker and everything after it, not the trailing line break). It adds no text; it exists
 * only so CSS can draw the quote bar down every soft-wrapped row of the line (ADR-0009). It must stay inline so
 * the editor's text content is still exactly the draft.
 */
export class ComposerQuoteLineNode extends ElementNode {
  $config() {
    return this.config('composer-quote-line', { extends: ElementNode });
  }

  createDOM(): HTMLElement {
    const dom = document.createElement('span');
    dom.className = 'composer-quote-line';
    return dom;
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): boolean {
    return true;
  }

  canBeEmpty(): boolean {
    return false;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }
}

export const $createComposerQuoteLineNode = (): ComposerQuoteLineNode => $create(ComposerQuoteLineNode);

export const $isComposerQuoteLineNode = (node: LexicalNode | null | undefined): node is ComposerQuoteLineNode =>
  node instanceof ComposerQuoteLineNode;
