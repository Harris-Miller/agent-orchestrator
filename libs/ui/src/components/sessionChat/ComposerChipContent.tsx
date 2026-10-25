import { cn } from 'cn';
import type { FC } from 'react';

import { commandChipClass, markdownLinkChipClass } from './composerChipSx.ts';
import { FileChipIconView } from './FileChipIconView.tsx';

type ComposerChipSharedProps = {
  readonly className?: string;
  readonly label: string;
  readonly testId?: string;
};

export type ComposerChipContentProps =
  | ({ readonly href?: string; readonly kind: 'markdownLink' } & ComposerChipSharedProps)
  | ({ readonly kind: 'command' } & ComposerChipSharedProps);

export const ComposerChipContent: FC<ComposerChipContentProps> = props => {
  const { className, kind, label, testId } = props;
  return (
    <span
      className={cn(kind === 'command' ? commandChipClass : markdownLinkChipClass, className)}
      contentEditable={false}
      data-testid={testId}
    >
      {kind === 'markdownLink' ? <FileChipIconView className="mr-[0.25em]" href={props.href} label={label} /> : null}
      {label}
    </span>
  );
};
