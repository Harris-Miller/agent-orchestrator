import {
  ElicitationArrayProperty,
  ElicitationBooleanProperty,
  ElicitationIntegerProperty,
  ElicitationNumberProperty,
  ElicitationStringProperty,
} from '@libs/effect-acp';
import type { CreateElicitationFormRequest, ElicitationContent, ElicitationPropertySchema } from '@libs/effect-acp';
import { Schema } from 'effect';

import type { ElicitationSummaryRow } from '../../host/sessionUpdateReducer.ts';

export type ElicitationChoice = { readonly label: string; readonly value: string };

/** A paired free-text "Other" field (Claude's `question_N_custom`), folded into its choice question. */
export type ElicitationOther = { readonly name: string; readonly placeholder: string };

type Shared = {
  /** Shorter of title/description, shown small above the label; undefined when only one is present. */
  readonly caption: string | undefined;
  readonly label: string;
  readonly name: string;
  readonly required: boolean;
  readonly secret: boolean;
};

export type ElicitationFieldView = Shared &
  (
    | { readonly default: string | undefined; readonly kind: 'text' }
    | { readonly default: number | undefined; readonly kind: 'number' | 'integer' }
    | { readonly default: boolean | undefined; readonly kind: 'boolean' }
    | {
        readonly default: string | undefined;
        readonly kind: 'single';
        readonly options: readonly ElicitationChoice[];
        readonly other: ElicitationOther | undefined;
      }
    | {
        readonly default: readonly string[] | undefined;
        readonly kind: 'multi';
        readonly maxItems: number | undefined;
        readonly minItems: number | undefined;
        readonly options: readonly ElicitationChoice[];
        readonly other: ElicitationOther | undefined;
      }
    | { readonly kind: 'unsupported'; readonly type: string }
  );

export type ElicitationValue = ElicitationContent[string] | undefined;
export type ElicitationValues = Readonly<Record<string, ElicitationValue>>;

/** `oneOf` wins over `enum`; undefined when neither is present. */
export const choiceOptions = (
  oneOf: readonly { readonly const: string; readonly title?: string | null }[] | null | undefined,
  enumValues: readonly string[] | null | undefined,
): readonly ElicitationChoice[] | undefined => {
  if (oneOf != null) {
    return oneOf.map(option => ({ label: option.title ?? option.const, value: option.const }));
  }
  return enumValues?.map(value => ({ label: value, value }));
};

/** Claude puts the question in `description`, Codex in `title`: the longer text is the label. */
type TextProps = { readonly description?: string | null; readonly title?: string | null };

const labelPair = (
  name: string,
  title: string | null | undefined,
  description: string | null | undefined,
): { readonly caption: string | undefined; readonly label: string } => {
  const t = title ?? undefined;
  const d = description ?? undefined;
  if (t === undefined || d === undefined) return { caption: undefined, label: d ?? t ?? name };
  return t.length > d.length ? { caption: d, label: t } : { caption: t, label: d };
};

const isSecret = (property: ElicitationPropertySchema): boolean => {
  const meta = property._meta as { readonly codex?: { readonly isSecret?: unknown } } | null | undefined;
  return meta?.codex?.isSecret === true;
};

const toView = (name: string, property: ElicitationPropertySchema, required: boolean): ElicitationFieldView => {
  const shared = {
    ...labelPair(name, (property as TextProps).title, (property as TextProps).description),
    name,
    required,
    secret: isSecret(property),
  };
  if (Schema.is(ElicitationArrayProperty)(property)) {
    const options = choiceOptions(property.items.oneOf ?? property.items.anyOf, property.items.enum);
    return options === undefined
      ? { ...shared, kind: 'unsupported', type: 'array' }
      : {
          ...shared,
          default: property.default ?? undefined,
          kind: 'multi',
          maxItems: property.maxItems ?? undefined,
          minItems: property.minItems ?? undefined,
          name,
          options,
          other: undefined,
        };
  }
  if (Schema.is(ElicitationStringProperty)(property)) {
    const options = choiceOptions(property.oneOf, property.enum);
    const base = { ...shared, default: property.default ?? undefined };
    return options === undefined ? { ...base, kind: 'text' } : { ...base, kind: 'single', options, other: undefined };
  }
  if (
    Schema.is(ElicitationNumberProperty)(property) ||
    Schema.is(ElicitationIntegerProperty)(property) ||
    Schema.is(ElicitationBooleanProperty)(property)
  ) {
    if (Schema.is(ElicitationBooleanProperty)(property)) {
      return { ...shared, default: property.default ?? undefined, kind: 'boolean' };
    }
    return { ...shared, default: property.default ?? undefined, kind: property.type };
  }
  return { ...shared, kind: 'unsupported', type: 'unknown' };
};

const customAnswerQuestionId = (property: ElicitationPropertySchema): string | undefined => {
  const meta = property._meta as
    | { readonly _askUserQuestionCustomAnswer?: { readonly questionId?: unknown } }
    | null
    | undefined;
  const id = meta?._askUserQuestionCustomAnswer?.questionId;
  return typeof id === 'string' ? id : undefined;
};

/** Custom-answer fields pair with a choice question and are folded into it as its "Other" choice. */
export const elicitationFieldViews = (request: CreateElicitationFormRequest): readonly ElicitationFieldView[] => {
  const { properties, required } = request.requestedSchema;
  const entries = Object.entries(properties ?? {});
  const views = entries.map(([name, property]) => toView(name, property, required?.includes(name) ?? false));
  const others = new Map<string, ElicitationOther>();
  for (const [name, property] of entries) {
    const questionId = customAnswerQuestionId(property);
    const target = views.find(view => view.name === questionId);
    if (questionId !== undefined && (target?.kind === 'single' || target?.kind === 'multi')) {
      const { label } = labelPair(name, (property as TextProps).title, (property as TextProps).description);
      others.set(questionId, { name, placeholder: label });
    }
  }
  const foldedNames = new Set([...others.values()].map(other => other.name));
  return views
    .filter(view => !foldedNames.has(view.name))
    .map(view => (view.kind === 'single' || view.kind === 'multi' ? { ...view, other: others.get(view.name) } : view));
};

/** Seed only from `default`; a boolean has no unset state so it seeds `false`. */
export const initialElicitationValues = (views: readonly ElicitationFieldView[]): ElicitationValues => {
  const values: Record<string, ElicitationValue> = {};
  for (const view of views) {
    if (view.kind !== 'unsupported') {
      values[view.name] = view.kind === 'boolean' ? (view.default ?? false) : view.default;
    }
  }
  return values;
};

const isSet = (value: ElicitationValue): boolean =>
  value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0);

export const canAcceptElicitation = (views: readonly ElicitationFieldView[], values: ElicitationValues): boolean =>
  views.every(view => {
    if (view.kind === 'unsupported') {
      return !view.required;
    }
    const value = values[view.name];
    const otherSet =
      (view.kind === 'single' || view.kind === 'multi') && view.other !== undefined && isSet(values[view.other.name]);
    if (view.kind === 'multi') {
      const count = (Array.isArray(value) ? value.length : 0) + (otherSet ? 1 : 0);
      if (count < (view.minItems ?? 0) || (view.maxItems !== undefined && count > view.maxItems)) {
        return false;
      }
      return !view.required || count > 0;
    }
    return !view.required || isSet(value) || otherSet;
  });

export const elicitationContent = (values: ElicitationValues): ElicitationContent => {
  const content: Record<string, NonNullable<ElicitationValue>> = {};
  for (const [name, value] of Object.entries(values)) {
    if (isSet(value)) {
      content[name] = value!;
    }
  }
  return content;
};

const formatValue = (
  view: Exclude<ElicitationFieldView, { kind: 'unsupported' }>,
  raw: NonNullable<ElicitationValue>,
) => {
  if (view.secret) return '••••••';
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  const options = view.kind === 'single' || view.kind === 'multi' ? view.options : [];
  const optionLabel = (v: string) => options.find(o => o.value === v)?.label ?? v;
  if (Array.isArray(raw)) return raw.map(optionLabel).join(', ');
  return typeof raw === 'string' ? optionLabel(raw) : String(raw);
};

/** One row per set, supported field; choice values show their option label, secrets are masked. */
export const elicitationSummaryRows = (
  views: readonly ElicitationFieldView[],
  values: ElicitationValues,
): readonly ElicitationSummaryRow[] =>
  views.flatMap(view => {
    if (view.kind === 'unsupported') return [];
    const raw = values[view.name];
    const other = (view.kind === 'single' || view.kind === 'multi') && view.other ? values[view.other.name] : undefined;
    const parts = [isSet(raw) ? formatValue(view, raw!) : undefined, isSet(other) ? String(other) : undefined].filter(
      part => part !== undefined,
    );
    return parts.length === 0 ? [] : [{ caption: view.caption, label: view.label, value: parts.join(', ') }];
  });
