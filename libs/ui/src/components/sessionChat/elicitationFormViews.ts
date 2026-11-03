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
    | { readonly default: string | undefined; readonly kind: 'single'; readonly options: readonly ElicitationChoice[] }
    | {
        readonly default: readonly string[] | undefined;
        readonly kind: 'multi';
        readonly maxItems: number | undefined;
        readonly minItems: number | undefined;
        readonly options: readonly ElicitationChoice[];
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
    const options = choiceOptions(property.items.oneOf, property.items.enum);
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
        };
  }
  if (Schema.is(ElicitationStringProperty)(property)) {
    const options = choiceOptions(property.oneOf, property.enum);
    const base = { ...shared, default: property.default ?? undefined };
    return options === undefined ? { ...base, kind: 'text' } : { ...base, kind: 'single', options };
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

export const elicitationFieldViews = (request: CreateElicitationFormRequest): readonly ElicitationFieldView[] => {
  const { properties, required } = request.requestedSchema;
  return Object.entries(properties ?? {}).map(([name, property]) =>
    toView(name, property, required?.includes(name) ?? false),
  );
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
    if (view.kind === 'multi') {
      const count = Array.isArray(value) ? value.length : 0;
      if (count < (view.minItems ?? 0) || (view.maxItems !== undefined && count > view.maxItems)) {
        return false;
      }
      return !view.required || count > 0;
    }
    return !view.required || isSet(value);
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
    const raw = values[view.name];
    if (view.kind === 'unsupported' || !isSet(raw)) return [];
    return [{ caption: view.caption, label: view.label, value: formatValue(view, raw!) }];
  });
