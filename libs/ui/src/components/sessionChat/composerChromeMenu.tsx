import { cn } from 'cn';
import type { FC } from 'react';

import { DropdownMenuItem } from '../ui/dropdown-menu.tsx';

/** Min width of the Model column in the Model·Effort menu (and matching mode menu). */
export const COMPOSER_MODEL_MENU_MIN_WIDTH = 148;

export const ComposerChoiceItem: FC<{
  readonly closeOnClick?: boolean;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly label: string;
  readonly onSelect: () => void;
  readonly selected: boolean;
}> = ({ closeOnClick, description, disabled, label, onSelect, selected }) => (
  <DropdownMenuItem
    className={cn('items-start whitespace-normal', selected && 'bg-accent')}
    closeOnClick={closeOnClick}
    disabled={disabled}
    onClick={onSelect}
  >
    <span className="flex flex-col">
      <span>{label}</span>
      {description !== undefined && description.length > 0 ? (
        <span className="text-xs text-muted-foreground">{description}</span>
      ) : null}
    </span>
  </DropdownMenuItem>
);
