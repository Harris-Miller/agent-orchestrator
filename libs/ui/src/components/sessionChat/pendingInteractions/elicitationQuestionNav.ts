import { canAcceptElicitation, elicitationFieldError, elicitationSummaryRows } from './elicitationFormViews.ts';
import type { ElicitationFieldView, ElicitationNote, ElicitationOther, ElicitationValues } from './elicitationFormViews.ts';

export type QuestionStatus = 'answered' | 'empty' | 'invalid';

/** The summary text of one question's answer, or undefined when nothing is set. */
export const answerText = (view: ElicitationFieldView, values: ElicitationValues): string | undefined =>
  elicitationSummaryRows([view], values)[0]?.value;

/** Per-question validity (gating) and whether an answer is present. */
export const questionStatus = (view: ElicitationFieldView, values: ElicitationValues): QuestionStatus => {
  if (!canAcceptElicitation([view], values)) return 'invalid';
  return answerText(view, values) === undefined ? 'empty' : 'answered';
};

/**
 * An invalid question is flagged once the user has moved past it or tried to submit (`attention`), or at once when
 * a value they set breaks its constraints.
 */
export const isFlagged = (view: ElicitationFieldView, values: ElicitationValues, attention: boolean): boolean =>
  questionStatus(view, values) === 'invalid' && (attention || answerText(view, values) !== undefined);

export const flagMessage = (view: ElicitationFieldView, values: ElicitationValues): string => {
  if (view.kind === 'unsupported') return 'Unsupported field';
  const error = elicitationFieldError(view, values[view.name]);
  if (error !== undefined) return error;
  if (view.kind === 'multi' && answerText(view, values) !== undefined) {
    return `Pick ${view.minItems ?? 0}–${view.maxItems ?? 'any'}`;
  }
  return 'Required';
};

/** Index of the first invalid question, or -1. */
export const firstInvalidIndex = (views: readonly ElicitationFieldView[], values: ElicitationValues): number =>
  views.findIndex(view => questionStatus(view, values) === 'invalid');

export type EnterAction =
  | { readonly kind: 'accept' }
  | { readonly kind: 'go'; readonly tab: number }
  | { readonly kind: 'none' };

/**
 * Enter on the tab at `tab` (`views.length` is the Submit tab): advance, or on Submit accept when valid, else jump
 * to the first invalid question.
 */
export const enterAction = (
  views: readonly ElicitationFieldView[],
  values: ElicitationValues,
  tab: number,
): EnterAction => {
  if (tab < views.length) return { kind: 'go', tab: tab + 1 };
  if (canAcceptElicitation(views, values)) return { kind: 'accept' };
  const invalid = firstInvalidIndex(views, values);
  return invalid >= 0 ? { kind: 'go', tab: invalid } : { kind: 'none' };
};

export type DigitResult = {
  readonly values: ElicitationValues;
  /** Name of the "Other" text box that should take focus. */
  readonly focusOther?: string;
};

type ChoiceView = Extract<ElicitationFieldView, { kind: 'single' | 'multi' }>;

/** Single select: pick `value` and clear "Other". */
export const selectOption = (view: ChoiceView, value: string, values: ElicitationValues): ElicitationValues => ({
  ...values,
  ...(view.other && { [view.other.name]: undefined }),
  [view.name]: value,
});

/** Multi select: flip `value` in the selection. */
export const toggleOption = (view: ChoiceView, value: string, values: ElicitationValues): ElicitationValues => {
  const raw = values[view.name];
  const selected: readonly string[] = Array.isArray(raw) ? raw : [];
  return {
    ...values,
    [view.name]: selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value],
  };
};

/** Check "Other" (empty text if unset); single select drops its picked option. */
export const checkOther = (
  view: ChoiceView,
  other: ElicitationOther,
  values: ElicitationValues,
): ElicitationValues => ({
  ...values,
  [other.name]: values[other.name] ?? '',
  ...(view.kind === 'single' && { [view.name]: undefined }),
});

/** Uncheck "Other" by clearing its text. */
export const uncheckOther = (other: ElicitationOther, values: ElicitationValues): ElicitationValues => ({
  ...values,
  [other.name]: undefined,
});

/** Set the "Other" text; single select drops its picked option. */
export const setOtherText = (
  view: ChoiceView,
  other: ElicitationOther,
  text: string,
  values: ElicitationValues,
): ElicitationValues => ({
  ...values,
  [other.name]: text,
  ...(view.kind === 'single' && { [view.name]: undefined }),
});

/** Set the note text; empty clears it. Never touches the selection. */
export const setNoteText = (note: ElicitationNote, text: string, values: ElicitationValues): ElicitationValues => ({
  ...values,
  [note.name]: text === '' ? undefined : text,
});

/** Digit `n` (1-9) on a question: pick/toggle option n, the digit after the last option is "Other", `1` flips a boolean. */
export const applyDigit = (view: ElicitationFieldView, digit: number, values: ElicitationValues): DigitResult => {
  if (view.kind === 'boolean') {
    return digit === 1 ? { values: { ...values, [view.name]: values[view.name] !== true } } : { values };
  }
  if (view.kind !== 'single' && view.kind !== 'multi') return { values };
  const { other } = view;
  const option = view.options[digit - 1];
  if (option === undefined) {
    if (other === undefined || digit !== view.options.length + 1) return { values };
    if (view.kind === 'multi' && values[other.name] !== undefined) return { values: uncheckOther(other, values) };
    return { focusOther: other.name, values: checkOther(view, other, values) };
  }
  return {
    values:
      view.kind === 'single' ? selectOption(view, option.value, values) : toggleOption(view, option.value, values),
  };
};
