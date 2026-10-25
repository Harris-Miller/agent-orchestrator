/** Render a string with fzf match indices emphasized (and optional bold tail). */
import { cn } from 'cn';
import type { FC, ReactNode } from 'react';

export type HighlightFzfCharsProps = {
  /** Inclusive start index for bold styling (e.g. basename). */
  readonly boldFrom?: number;
  readonly positions: ReadonlySet<number>;
  readonly text: string;
};

export const HighlightFzfChars: FC<HighlightFzfCharsProps> = ({ boldFrom, positions, text }) => {
  const normalized = text.normalize();
  const nodes: ReactNode[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized.charAt(index);
    const highlighted = positions.has(index);
    const bold = boldFrom !== undefined && index >= boldFrom;
    nodes.push(
      <span
        className={cn((highlighted || bold) && 'font-bold', highlighted && 'rounded-xs bg-amber-400/30')}
        key={`fzf-${String(index)}`}
      >
        {char}
      </span>,
    );
  }
  return nodes;
};
