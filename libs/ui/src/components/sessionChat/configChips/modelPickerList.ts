import type { NormalizedConfigOption, NormalizedSelectConfigOption } from '../../../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../../../host/agentLaunchTarget.ts';
import { arrangeModelChoices } from '../../../host/modelPickerPrefs.ts';
import type { ModelPickerPrefs } from '../../../host/modelPickerPrefs.ts';

import { pickerPaneHeight } from './pickerLayout.ts';
import type { OptionRowKind } from './pickerLayout.ts';
import { ultracodeRow, ultracodeSuffixParts, withoutUltracodeOption } from './ultracode.ts';
import type { UltracodeRow } from './ultracode.ts';
import { isPlanSwitch, optionRowsFor, toggleSuffixParts } from './wellKnownConfigOption.ts';
import type { OptionRowModel } from './wellKnownConfigOption.ts';
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

/** Chip suffix parts after the model name: effort, then Ultracode, Fast and Plan when on. */
export const chipSuffixParts = (
  launchTarget: AgentLaunchTarget | undefined,
  options: readonly NormalizedConfigOption[],
  effort: NormalizedSelectConfigOption | undefined,
): readonly string[] => {
  const effortName = effort?.choices.find(choice => choice.id === effort.currentValue)?.name ?? effort?.currentValue;
  const ultracode = ultracodeSuffixParts(launchTarget, options);
  return [effortName, ...ultracode, ...toggleSuffixParts(launchTarget, options)].filter(
    (part): part is string => part !== undefined && part !== '',
  );
};

/** What `OptionRow` renders for a row: a switch, a select, or nothing (a select with no choices). */
const optionRowKind = (launchTarget: AgentLaunchTarget | undefined, row: OptionRowModel): OptionRowKind | undefined => {
  if (row.kind === 'absent' || row.option.type === 'boolean' || isPlanSwitch(launchTarget, row.option)) {
    return 'switch';
  }
  return row.option.choices.length === 0 ? undefined : 'select';
};

/** Everything the picker popover derives from the session's Config options. */
export type PickerViewModel = {
  /** Rows OptionRow renders after the Ultracode row; empty selects are already dropped. */
  readonly optionRows: readonly OptionRowModel[];
  readonly paneHeight: number;
  readonly reasoning: NormalizedSelectConfigOption['choices'];
  readonly rows: readonly ModelRow[];
  readonly suffix: readonly string[];
  readonly ultracode: UltracodeRow | undefined;
};

export const pickerViewModel = (
  launchTarget: AgentLaunchTarget | undefined,
  input: {
    readonly effort: NormalizedSelectConfigOption | undefined;
    readonly model: NormalizedSelectConfigOption;
    readonly options: readonly NormalizedConfigOption[];
    readonly prefs: ModelPickerPrefs;
    readonly unavailableModelIds: readonly string[];
  },
): PickerViewModel => {
  const { effort, model, options, prefs, unavailableModelIds } = input;
  const ultracode = ultracodeRow(launchTarget, options);
  const kinds = optionRowsFor(launchTarget, withoutUltracodeOption(options)).map(row => ({
    kind: optionRowKind(launchTarget, row),
    row,
  }));
  const optionRows = kinds.filter(entry => entry.kind !== undefined).map(entry => entry.row);
  const rowKinds = [
    ...(ultracode === undefined ? [] : ['switch' as const]),
    ...kinds.flatMap(entry => (entry.kind === undefined ? [] : [entry.kind])),
  ];
  const reasoning = effort?.choices ?? [];
  return {
    optionRows,
    paneHeight: pickerPaneHeight(reasoning.length, rowKinds),
    reasoning,
    rows: modelRowsFor(model.choices, {
      ...prefs,
      currentId: model.currentValue,
      launchTarget,
      unavailableIds: unavailableModelIds,
    }),
    suffix: chipSuffixParts(launchTarget, options, effort),
    ultracode,
  };
};
