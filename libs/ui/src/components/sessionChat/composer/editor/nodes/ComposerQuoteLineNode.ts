import { $create, ElementNode } from 'lexical';
import type { LexicalNode } from 'lexical';

/**
 * One quote line's nodes, wrapped so the Composer can draw the quote bar as this element's left border and have it
 * span soft-wrapped rows. Inline and text-less of its own: the editor's text content is still the draft (ADR-0009).
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

  isInline(): true {
    return true;
  }

  canBeEmpty(): false {
    return false;
  }
}

export const $createComposerQuoteLineNode = (): ComposerQuoteLineNode => $create(ComposerQuoteLineNode);

export const $isComposerQuoteLineNode = (node: LexicalNode | null | undefined): node is ComposerQuoteLineNode =>
  node instanceof ComposerQuoteLineNode;
