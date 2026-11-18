import type { NormalizedConfigOption, NormalizedSelectConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import { arrangeModelChoices } from '../../../host/modelPickerPrefs.ts';
import type { ModelPickerPrefs } from '../../../host/modelPickerPrefs.ts';

import { isFastOption, isPlanOn } from './wellKnownConfigOption.ts';
import { ULTRA_EFFORT_ID, ULTRACODE_OPTION_ID } from './ultra.ts';
import { modelSelectChoiceLabel } from './sessionConfigOptionSelectViews.ts';

/** One row of the picker's model list. */
export type ModelRow = {
  readonly description: string | undefined;
  readonly disabled: boolean;
  /** A Hidden model that is not the current one. */
  readonly hidden: boolean;
  readonly id: string;
  readonly label: string;
  readonly launchTarget: AgentLaunchTarget | undefined;
};

/**
 * Rows for one model select in Model order. Hidden-ness follows `arrangeModelChoices`: the current model is never
 * hidden, and hiding every usable model is ignored.
 */
export const modelRowsFor = (
  choices: NormalizedSelectConfigOption['choices'],
  options: ModelPickerPrefs & {
    readonly currentId: string | undefined;
    readonly launchTarget: AgentLaunchTarget | undefined;
    readonly unavailableIds: readonly string[];
  },
): readonly ModelRow[] => {
  const shown = new Set(arrangeModelChoices(choices, options).map(choice => choice.id));
  const ordered = arrangeModelChoices(choices, { ...options, hidden: [] });
  return ordered.map(choice => {
    const unavailable = options.unavailableIds.includes(choice.id);
    return {
      description: choice.description,
      disabled: unavailable,
      hidden: !shown.has(choice.id),
      id: choice.id,
      label: modelSelectChoiceLabel(choice.name, unavailable),
      launchTarget: options.launchTarget,
    };
  });
};

/** Browse view: shown rows, plus the Hidden ones behind "Show more". */
export const splitModelRows = (rows: readonly ModelRow[]) => ({
  hidden: rows.filter(row => row.hidden),
  shown: rows.filter(row => !row.hidden),
});

/** Search matches Hidden and unhidden models, unhidden first (each group keeps its order). */
export const searchModelRows = (rows: readonly ModelRow[], query: string): readonly ModelRow[] => {
  const needle = query.trim().toLowerCase();
  const hits = rows.filter(row => row.label.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle));
  return [...hits.filter(row => !row.hidden), ...hits.filter(row => row.hidden)];
};

/** Chip suffix parts after the model name: effort (or Ultra label), then Fast / Plan when on. */
export const chipSuffixParts = (
  launchTarget: AgentLaunchTarget | undefined,
  options: readonly NormalizedConfigOption[],
  effort: NormalizedSelectConfigOption | undefined,
  ultraLabel: string,
): readonly string[] => {
  const effortName = effort?.choices.find(choice => choice.id === effort.currentValue)?.name ?? effort?.currentValue;
  const ultraByEffort = effort?.currentValue === ULTRA_EFFORT_ID;
  const ultracodeOn = options.some(option => option.id === ULTRACODE_OPTION_ID && option.currentValue === true);
  return [
    ultraByEffort ? ultraLabel : effortName,
    ultracodeOn ? ultraLabel : undefined,
    options.some(option => isFastOption(launchTarget, option.id) && option.currentValue === true) ? 'Fast' : undefined,
    options.some(option => option.id === 'collaboration_mode' && isPlanOn(option)) ? 'Plan' : undefined,
  ].filter((part): part is string => part !== undefined && part !== '');
};
