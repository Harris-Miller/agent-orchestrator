import { canAcceptElicitation, elicitationFieldError, elicitationSummaryRows } from './elicitationFormViews.ts';
import type { ElicitationFieldView, ElicitationValues } from './elicitationFormViews.ts';

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
    if (view.kind === 'single') {
      return {
        focusOther: other.name,
        values: { ...values, [other.name]: values[other.name] ?? '', [view.name]: undefined },
      };
    }
    return values[other.name] === undefined
      ? { focusOther: other.name, values: { ...values, [other.name]: '' } }
      : { values: { ...values, [other.name]: undefined } };
  }
  if (view.kind === 'single') {
    return { values: { ...values, ...(other && { [other.name]: undefined }), [view.name]: option.value } };
  }
  const raw = values[view.name];
  const selected: readonly string[] = Array.isArray(raw) ? raw : [];
  return {
    values: {
      ...values,
      [view.name]: selected.includes(option.value)
        ? selected.filter(item => item !== option.value)
        : [...selected, option.value],
    },
  };
};
