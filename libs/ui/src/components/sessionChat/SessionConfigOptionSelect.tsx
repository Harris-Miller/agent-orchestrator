import type { FC } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { ComposerChoiceItem } from './composerChromeMenu.tsx';
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
          <ComposerChoiceItem
            description={choice.description}
            disabled={choice.disabled}
            key={choice.id}
            label={choice.label}
            onSelect={() => {
              onChange(option.id, choice.id);
            }}
            selected={option.currentValue === choice.id}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
