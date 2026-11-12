import { $create, $getState, $getStateChange, $setState, createState, TextNode } from 'lexical';
import type { EditorConfig, LexicalEditor } from 'lexical';

import { MARKDOWN_BLOCKS, MARKDOWN_ROLES } from '../composerMarkdown.ts';
import type { MarkdownBlock, MarkdownRole } from '../composerMarkdown.ts';
import type { ComposerTextStyle } from '../composerPieces.ts';

const roleState = createState('mdRole', {
  parse: (value): MarkdownRole => MARKDOWN_ROLES.find(role => role === value) ?? 'text',
});
const blockState = createState('mdBlock', {
  parse: (value): MarkdownBlock => MARKDOWN_BLOCKS.find(block => block === value) ?? 'paragraph',
});
const spanState = createState('mdSpan', { parse: (value): string => (typeof value === 'string' ? value : '') });

const setOrRemove = (dom: HTMLElement, name: string, value: string | undefined): void => {
  if (value === undefined) {
    dom.removeAttribute(name);
  } else {
    dom.setAttribute(name, value);
  }
};

const applyMarkdownAttributes = (dom: HTMLElement, node: ComposerMarkdownTextNode): void => {
  const role = $getState(node, roleState);
  const block = $getState(node, blockState);
  setOrRemove(dom, 'data-md-role', role === 'text' ? undefined : role);
  setOrRemove(dom, 'data-md-block', block === 'paragraph' ? undefined : block);
  setOrRemove(dom, 'data-md-span', $getState(node, spanState) || undefined);
};

/**
 * A run of draft text styled by Markdown styling. Carries its role/block/line as data attributes for the
 * Composer's CSS and Marker reveal; its text is always a verbatim slice of the draft.
 */
export class ComposerMarkdownTextNode extends TextNode {
  $config() {
    return this.config('composer-markdown-text', { extends: TextNode });
  }

  createDOM(config: EditorConfig, editor?: LexicalEditor): HTMLElement {
    const dom = super.createDOM(config, editor);
    applyMarkdownAttributes(dom, this);
    return dom;
  }

  updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const replace = super.updateDOM(prevNode, dom, config);
    if (
      !replace &&
      ($getStateChange(this, prevNode, roleState) !== null ||
        $getStateChange(this, prevNode, blockState) !== null ||
        $getStateChange(this, prevNode, spanState) !== null)
    ) {
      applyMarkdownAttributes(dom, this);
    }
    return replace;
  }
}

export const $createComposerMarkdownTextNode = (value: string, style: ComposerTextStyle): ComposerMarkdownTextNode => {
  const node = $create(ComposerMarkdownTextNode).setTextContent(value);
  if (style.bold) {
    node.toggleFormat('bold');
  }
  if (style.italic) {
    node.toggleFormat('italic');
  }
  if (style.strike) {
    node.toggleFormat('strikethrough');
  }
  if (style.code) {
    node.toggleFormat('code');
  }
  $setState(node, roleState, style.role);
  $setState(node, blockState, style.block);
  $setState(node, spanState, style.span);
  return node;
};

/** The style a text node currently has; a plain Lexical text node reads as unstyled paragraph text. */
export const $readComposerTextStyle = (node: TextNode): ComposerTextStyle => ({
  block: $getState(node, blockState),
  bold: node.hasFormat('bold'),
  code: node.hasFormat('code'),
  italic: node.hasFormat('italic'),
  role: $getState(node, roleState),
  span: $getState(node, spanState),
  strike: node.hasFormat('strikethrough'),
});
