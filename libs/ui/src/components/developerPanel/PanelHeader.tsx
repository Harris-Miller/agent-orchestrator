import type { FC, ReactNode } from 'react';

import { Button } from '../ui/button.tsx';

export const PanelHeader: FC<{
  readonly closeAriaLabel: string;
  readonly closeGlyph: string;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly titleEnd?: ReactNode;
}> = ({ closeAriaLabel, closeGlyph, onClose, title, titleEnd }) => (
  <div className="ao-pane-header">
    <div className="flex min-w-0 items-center gap-1">
      {typeof title === 'string' ? <h2 className="text-lg font-medium">{title}</h2> : title}
      {titleEnd}
    </div>
    <Button aria-label={closeAriaLabel} onClick={onClose} size="icon-sm" variant="ghost">
      {closeGlyph}
    </Button>
  </div>
);
