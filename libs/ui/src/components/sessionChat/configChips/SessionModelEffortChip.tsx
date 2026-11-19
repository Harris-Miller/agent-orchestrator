import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Popover from '@mui/material/Popover';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { FC } from 'react';

import type { NormalizedConfigOption, NormalizedSelectConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import type { ModelPickerPrefs } from '../../../host/modelPickerPrefs.ts';
import type { ConfigValueDiff } from '../../../host/sessionConfiguration.ts';

import { ComposerChromeChip } from './ComposerChromeChip.tsx';
import { COMPOSER_MODEL_MENU_MIN_WIDTH, useComposerChromeMenu } from './composerChromeMenu.ts';
import { pickerViewModel } from './modelPickerList.ts';
import { modelListMaxHeight } from './pickerLayout.ts';
import type { ModelRow } from './modelPickerList.ts';
import { ModelPickerList } from './ModelPickerList.tsx';
import { AbsentOptionRowView, OptionRow, UltracodeOptionRow } from './OptionRows.tsx';
import { ReasoningList } from './ReasoningList.tsx';
import { configOptionChoiceLabel } from './sessionConfigOptionSelectViews.ts';
import { ultracodeToggleDiffs } from './ultracode.ts';

const POPOVER_WIDTH = 680;

export const SessionModelEffortChip: FC<{
  readonly disabled?: boolean;
  readonly effort?: NormalizedSelectConfigOption;
  readonly launchTarget?: AgentLaunchTarget;
  readonly model: NormalizedSelectConfigOption;
  readonly onChange: (diff: ConfigValueDiff) => void;
  /** Every Config option besides mode / model / effort: rows of the Options section. */
  readonly options?: readonly NormalizedConfigOption[];
  readonly prefs: ModelPickerPrefs;
  readonly unavailableModelIds?: readonly string[];
}> = ({ disabled = false, effort, launchTarget, model, onChange, options = [], prefs, unavailableModelIds = [] }) => {
  const menu = useComposerChromeMenu();
  const [hover, setHover] = useState<ModelRow | undefined>();

  const { optionRows, paneHeight, rows, suffix, ultracode } = pickerViewModel(launchTarget, {
    effort,
    model,
    options,
    prefs,
    unavailableModelIds,
  });
  const described = hover ??
    rows.find(row => row.id === model.currentValue) ?? { description: undefined, label: model.currentValue };

  const pickModel = (row: ModelRow) => {
    onChange({ configId: model.id, type: 'select', value: row.id });
  };

  const toggleUltracode = (on: boolean) => {
    for (const diff of ultracodeToggleDiffs(options, on)) {
      onChange(diff);
    }
  };

  return (
    <>
      <ComposerChromeChip active={menu.active} disabled={disabled} onClick={menu.openFromClick}>
        <Typography component="span" sx={{ color: 'text.primary', fontSize: 13 }}>
          {configOptionChoiceLabel(model)}
        </Typography>
        {suffix.length > 0 ? (
          <Typography component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>
            · {suffix.join(' · ')}
          </Typography>
        ) : null}
      </ComposerChromeChip>
      <Popover
        anchorEl={menu.menuProps.anchorEl}
        anchorOrigin={menu.menuProps.anchorOrigin}
        onClose={() => {
          setHover(undefined);
          menu.close();
        }}
        open={menu.menuProps.open}
        slotProps={{ paper: { sx: { maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' } } }}
        transformOrigin={menu.menuProps.transformOrigin}
      >
        <Box sx={{ maxWidth: 'calc(100vw - 32px)', width: POPOVER_WIDTH }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
            <Box sx={{ flex: '1 1 240px', minWidth: COMPOSER_MODEL_MENU_MIN_WIDTH }}>
              <ModelPickerList
                maxHeight={modelListMaxHeight(paneHeight)}
                currentId={model.currentValue}
                onHover={setHover}
                onPick={pickModel}
                rows={rows}
                searchPlaceholder="Search models…"
              />
            </Box>
            <Divider flexItem sx={{ display: { xs: 'none', sm: 'block' } }} orientation="vertical" />
            <Box sx={{ flex: '1 1 240px', maxWidth: { sm: 300 }, minHeight: { sm: paneHeight } }}>
              {effort === undefined ? null : <ReasoningList effort={effort} onChange={onChange} />}
              <Typography color="text.secondary" sx={{ display: 'block', px: 2, pt: 1.25 }} variant="caption">
                Options
              </Typography>
              <MenuList dense sx={{ p: 1 }}>
                {ultracode === undefined ? null : (
                  <UltracodeOptionRow disabled={disabled} onToggle={toggleUltracode} row={ultracode} />
                )}
                {optionRows.map(row =>
                  row.kind === 'absent' ? (
                    <AbsentOptionRowView key={row.label} row={row} />
                  ) : (
                    <OptionRow
                      disabled={disabled}
                      key={row.option.id}
                      launchTarget={launchTarget}
                      onChange={onChange}
                      option={row.option}
                    />
                  ),
                )}
              </MenuList>
            </Box>
          </Box>
          <Divider />
          <Box sx={{ minHeight: 56, px: 2, py: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{described.label}</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 12.5 }}>
              {described.description}
            </Typography>
          </Box>
        </Box>
      </Popover>
    </>
  );
};
