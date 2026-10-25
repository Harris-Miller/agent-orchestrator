import { cn } from 'cn';
import type { FC } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { COMPOSER_MODEL_MENU_MIN_WIDTH } from './composerChromeMenu.ts';
import { configOptionChoiceLabel, selectChoiceViews } from './sessionConfigOptionSelectViews.ts';

export const SessionModelEffortChip: FC<{
  readonly disabled?: boolean;
  readonly effort?: NormalizedSelectConfigOption;
  readonly model: NormalizedSelectConfigOption;
  readonly onChange: (diff: ConfigValueDiff) => void;
  readonly unavailableModelIds?: readonly string[];
}> = ({ disabled = false, effort, model, onChange, unavailableModelIds = [] }) => {
  const modelViews = selectChoiceViews(model, unavailableModelIds);
  const effortViews = effort === undefined ? [] : selectChoiceViews(effort);
  const dualColumn = effort !== undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger disabled={disabled} render={<ComposerChromeChip disabled={disabled} />}>
        <span className="text-[13px] text-foreground">{configOptionChoiceLabel(model)}</span>
        {effort !== undefined ? (
          <span className="text-[13px] text-muted-foreground">· {configOptionChoiceLabel(effort)}</span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent className={dualColumn ? 'flex w-auto flex-row p-0' : undefined} side="top">
        <div className="py-1" style={{ minWidth: COMPOSER_MODEL_MENU_MIN_WIDTH }}>
          {dualColumn ? <p className="px-2 py-1 text-xs text-muted-foreground">Model</p> : null}
          {modelViews.map(view => (
            <DropdownMenuItem
              className={cn(model.currentValue === view.id && 'bg-accent')}
              closeOnClick={!dualColumn}
              disabled={view.disabled}
              key={view.id}
              onClick={() => {
                onChange({ configId: model.id, type: 'select', value: view.id });
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
        </div>
        {effort !== undefined ? (
          <>
            <div className="w-px self-stretch bg-border" />
            <div className="py-1" style={{ minWidth: COMPOSER_MODEL_MENU_MIN_WIDTH }}>
              <p className="px-2 py-1 text-xs text-muted-foreground">Effort</p>
              {effortViews.map(view => (
                <DropdownMenuItem
                  className={cn(effort.currentValue === view.id && 'bg-accent')}
                  closeOnClick={false}
                  key={view.id}
                  onClick={() => {
                    onChange({ configId: effort.id, type: 'select', value: view.id });
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
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
