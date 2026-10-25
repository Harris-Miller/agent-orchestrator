import type { FC } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { COMPOSER_MODEL_MENU_MIN_WIDTH, ComposerChoiceItem } from './composerChromeMenu.tsx';
import { configOptionChoiceLabel, selectChoiceViews } from './sessionConfigOptionSelectViews.ts';

/** Chip bound to Config option `mode` (UI label may say Access). */
export const SessionAccessChip: FC<{
  readonly disabled?: boolean;
  readonly onChange: (diff: ConfigValueDiff) => void;
  readonly option: NormalizedSelectConfigOption;
}> = ({ disabled = false, onChange, option }) => {
  const views = selectChoiceViews(option);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={disabled} render={<ComposerChromeChip disabled={disabled} />}>
        {configOptionChoiceLabel(option)}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-[360px]" side="top" style={{ minWidth: COMPOSER_MODEL_MENU_MIN_WIDTH }}>
        {views.map(view => (
          <ComposerChoiceItem
            description={view.description}
            key={view.id}
            label={view.label}
            onSelect={() => {
              onChange({ configId: option.id, type: 'select', value: view.id });
            }}
            selected={option.currentValue === view.id}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
