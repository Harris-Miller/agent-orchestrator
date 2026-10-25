import { cn } from 'cn';
import type { FC } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { COMPOSER_MODEL_MENU_MIN_WIDTH } from './composerChromeMenu.ts';
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
          <DropdownMenuItem
            className={cn('items-start whitespace-normal', option.currentValue === view.id && 'bg-accent')}
            key={view.id}
            onClick={() => {
              onChange({ configId: option.id, type: 'select', value: view.id });
            }}
          >
            <span className="flex flex-col">
              <span>{view.label}</span>
              {view.description !== undefined ? (
                <span className="text-xs text-muted-foreground">{view.description}</span>
              ) : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
