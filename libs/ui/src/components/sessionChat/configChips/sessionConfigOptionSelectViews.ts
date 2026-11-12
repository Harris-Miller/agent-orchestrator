import type { NormalizedSelectConfigOption } from '../../../host/acpSessionBootstrap.ts';

/** Presentation row for a select MenuItem (label/disabled already resolved). */
export type SelectChoiceView = {
  readonly description?: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly label: string;
};

/** Chip label: current choice name, else option name. */
export const configOptionChoiceLabel = (option: NormalizedSelectConfigOption): string => {
  const current = option.currentValue;
  if (current === undefined) {
    return option.name;
  }
  return option.choices.find(choice => choice.id === current)?.name ?? current;
};

/** Model select choice label when the id is an Unavailable model. */
export const modelSelectChoiceLabel = (name: string, unavailable: boolean): string =>
  unavailable ? `${name} (unavailable)` : name;

export const isModelChoiceUnavailable = (
  optionId: string,
  choiceId: string,
  unavailableModelIds: readonly string[],
): boolean => optionId === 'model' && unavailableModelIds.includes(choiceId);

/** Resolve select choices against Unavailable models from the Config option index. */
export const selectChoiceViews = (
  option: NormalizedSelectConfigOption,
  unavailableModelIds: readonly string[] = [],
): readonly SelectChoiceView[] =>
  option.choices.map(choice => {
    const unavailable = isModelChoiceUnavailable(option.id, choice.id, unavailableModelIds);
    return {
      description: choice.description,
      disabled: unavailable,
      id: choice.id,
      label: modelSelectChoiceLabel(choice.name, unavailable),
    };
  });
