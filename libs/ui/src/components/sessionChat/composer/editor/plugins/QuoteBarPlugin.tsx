import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { mergeRegister } from 'lexical';
import { useEffect } from 'react';
import type { FC } from 'react';

// Half a line box (0.875rem * 1.43 ≈ 20px): inline code/chips have a different ascent, so same-line tops can differ by several px.
const SAME_LINE_TOLERANCE_PX = 10;

/** How many visual lines a set of client rects spans; zero-size rects are ignored. Always at least 1. */
export const countVisualLines = (rects: readonly { top: number; width: number; height: number }[]): number => {
  const tops: number[] = [];
  for (const rect of rects) {
    if (rect.width > 0 && rect.height > 0 && !tops.some(top => Math.abs(top - rect.top) < SAME_LINE_TOLERANCE_PX)) {
      tops.push(rect.top);
    }
  }
  return Math.max(1, tops.length);
};

const measure = (root: HTMLElement): void => {
  for (const marker of root.querySelectorAll<HTMLElement>('[data-md-block="quote"][data-md-role="blockMarker"]')) {
    const range = document.createRange();
    range.setStartBefore(marker);
    let end: Node | null = marker;
    while (end !== null && end.nodeName !== 'BR') {
      end = end.nextSibling ?? null;
    }
    if (end === null) {
      range.setEndAfter(marker.parentNode?.lastChild ?? marker);
    } else {
      range.setEndBefore(end);
    }
    marker.style.setProperty('--composer-quote-lines', String(countVisualLines([...range.getClientRects()])));
  }
};

/** Tells each quote line's bar how many visual lines the line wraps to, so the bar spans all of them. */
export const QuoteBarPlugin: FC = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    let observer: ResizeObserver | null = null;
    const run = () => {
      const root = editor.getRootElement();
      if (root !== null) {
        measure(root);
      }
    };
    return mergeRegister(
      editor.registerUpdateListener(run),
      editor.registerRootListener(root => {
        observer?.disconnect();
        observer = null;
        if (root !== null) {
          observer = new ResizeObserver(run);
          observer.observe(root);
        }
      }),
      () => {
        observer?.disconnect();
      },
    );
  }, [editor]);

  return null;
};
