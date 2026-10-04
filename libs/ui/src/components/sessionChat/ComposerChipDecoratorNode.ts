import { DecoratorNode } from 'lexical';
import type { DOMExportOutput } from 'lexical';
import type { JSX } from 'react';

/** Shared Lexical defaults for Command Chip / Markdown Link Chip decorator nodes. */
export abstract class ComposerChipDecoratorNode extends DecoratorNode<JSX.Element> {
  exportDOM(): DOMExportOutput {
    const element = document.createElement('span');
    element.textContent = this.getTextContent();
    return { element };
  }

  getTextContentSize(): number {
    return this.getTextContent().length;
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

  protected createChipHostDom(className: string): HTMLElement {
    const span = document.createElement('span');
    span.className = className;
    return span;
  }
}
