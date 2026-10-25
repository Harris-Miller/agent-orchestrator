import { cn } from 'cn';
import type { FC } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { configOptionChoiceLabel, selectChoiceViews } from './sessionConfigOptionSelectViews.ts';

/** Pill for a select Config option — current value only; menu for choices. */
export const SessionConfigOptionSelect: FC<{
  readonly disabled: boolean;
  readonly onChange: (configId: string, value: string) => void;
  readonly option: NormalizedSelectConfigOption;
  readonly unavailableModelIds?: readonly string[];
}> = ({ disabled, onChange, option, unavailableModelIds }) => {
  const choices = selectChoiceViews(option, unavailableModelIds);

  if (choices.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={disabled} render={<ComposerChromeChip disabled={disabled} />}>
        {configOptionChoiceLabel(option)}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-[360px]" side="top">
        {choices.map(choice => (
          <DropdownMenuItem
            className={cn('items-start whitespace-normal', option.currentValue === choice.id && 'bg-accent')}
            closeOnClick
            disabled={choice.disabled}
            key={choice.id}
            onClick={() => {
              onChange(option.id, choice.id);
            }}
          >
            <span className="flex flex-col">
              <span>{choice.label}</span>
              {choice.description !== undefined ? (
                <span className="text-xs text-muted-foreground">{choice.description}</span>
              ) : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
