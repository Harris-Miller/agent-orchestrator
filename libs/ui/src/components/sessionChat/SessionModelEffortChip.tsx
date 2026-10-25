import type { FC } from 'react';

import type { NormalizedSelectConfigOption } from '../../host/acpSessionBootstrap.ts';
import type { ConfigValueDiff } from '../../host/sessionMaterialize.ts';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/dropdown-menu.tsx';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { COMPOSER_MODEL_MENU_MIN_WIDTH, ComposerChoiceItem } from './composerChromeMenu.tsx';
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
            <ComposerChoiceItem
              closeOnClick={!dualColumn}
              description={view.description}
              disabled={view.disabled}
              key={view.id}
              label={view.label}
              onSelect={() => {
                onChange({ configId: model.id, type: 'select', value: view.id });
              }}
              selected={model.currentValue === view.id}
            />
          ))}
        </div>
        {effort !== undefined ? (
          <>
            <div className="w-px self-stretch bg-border" />
            <div className="py-1" style={{ minWidth: COMPOSER_MODEL_MENU_MIN_WIDTH }}>
              <p className="px-2 py-1 text-xs text-muted-foreground">Effort</p>
              {effortViews.map(view => (
                <ComposerChoiceItem
                  closeOnClick={false}
                  description={view.description}
                  key={view.id}
                  label={view.label}
                  onSelect={() => {
                    onChange({ configId: effort.id, type: 'select', value: view.id });
                  }}
                  selected={effort.currentValue === view.id}
                />
              ))}
            </div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
