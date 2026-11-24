import {
  ElicitationArrayProperty,
  ElicitationBooleanProperty,
  ElicitationIntegerProperty,
  ElicitationNumberProperty,
  ElicitationStringProperty,
} from '@lib/effect-acp';
import type { CreateElicitationFormRequest, ElicitationContent, ElicitationPropertySchema } from '@lib/effect-acp';
import { Schema } from 'effect';

import type { ElicitationSummaryRow } from '../../../host/sessionUpdateReducer.ts';

export type ElicitationChoice = { readonly label: string; readonly value: string };

/** A free-text field paired with a choice question and folded into it. */
export type ElicitationPairedField = { readonly name: string; readonly placeholder: string };

/** Claude's `question_N_custom`, shown as the question's "Other" choice. */
export type ElicitationOther = ElicitationPairedField;

/** Codex's `question_N_note` (`role: user_note`), an optional note on the question. */
export type ElicitationNote = ElicitationPairedField;

type ElicitationFieldBase = {
  /** Shorter of title/description, shown small above the label; undefined when only one is present. */
  readonly caption: string | undefined;
  readonly label: string;
  readonly name: string;
  readonly required: boolean;
  readonly secret: boolean;
};

export type ElicitationFieldView = ElicitationFieldBase &
  (
    | {
        readonly default: string | undefined;
        readonly format: string | undefined;
        readonly kind: 'text';
        readonly maxLength: number | undefined;
        readonly minLength: number | undefined;
        readonly pattern: string | undefined;
      }
    | {
        readonly default: number | undefined;
        readonly kind: 'number' | 'integer';
        readonly maximum: number | undefined;
        readonly minimum: number | undefined;
      }
    | { readonly default: boolean | undefined; readonly kind: 'boolean' }
    | {
        readonly default: string | undefined;
        readonly kind: 'single';
        readonly options: readonly ElicitationChoice[];
        readonly note: ElicitationNote | undefined;
        readonly other: ElicitationOther | undefined;
      }
    | {
        readonly default: readonly string[] | undefined;
        readonly kind: 'multi';
        readonly maxItems: number | undefined;
        readonly minItems: number | undefined;
        readonly options: readonly ElicitationChoice[];
        readonly note: ElicitationNote | undefined;
        readonly other: ElicitationOther | undefined;
      }
    | { readonly kind: 'unsupported'; readonly type: string }
  );

type ElicitationChoiceView = Extract<ElicitationFieldView, { kind: 'single' | 'multi' }>;

const isChoiceView = (view: ElicitationFieldView | undefined): view is ElicitationChoiceView =>
  view?.kind === 'single' || view?.kind === 'multi';

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
  property: ElicitationPropertySchema,
): { readonly caption: string | undefined; readonly label: string } => {
  const text = property as TextProps;
  const title = text.title ?? undefined;
  const description = text.description ?? undefined;
  if (title === undefined || description === undefined) {
    return { caption: undefined, label: description ?? title ?? name };
  }
  return title.length > description.length
    ? { caption: description, label: title }
    : { caption: title, label: description };
};

/** Vendor `_meta` keys we read: Codex secrets and Claude's custom-answer pairing. */
type PropertyMeta =
  | {
      readonly _askUserQuestionCustomAnswer?: { readonly questionId?: unknown };
      readonly codex?: { readonly isSecret?: unknown; readonly questionId?: unknown; readonly role?: unknown };
    }
  | null
  | undefined;

const propertyMeta = (property: ElicitationPropertySchema): PropertyMeta => property._meta as PropertyMeta;

const toView = (name: string, property: ElicitationPropertySchema, required: boolean): ElicitationFieldView => {
  const shared = {
    ...labelPair(name, property),
    name,
    required,
    secret: propertyMeta(property)?.codex?.isSecret === true,
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
          note: undefined,
          options,
          other: undefined,
        };
  }
  if (Schema.is(ElicitationStringProperty)(property)) {
    const options = choiceOptions(property.oneOf, property.enum);
    const base = { ...shared, default: property.default ?? undefined };
    return options === undefined
      ? {
          ...base,
          format: property.format ?? undefined,
          kind: 'text',
          maxLength: property.maxLength ?? undefined,
          minLength: property.minLength ?? undefined,
          pattern: property.pattern ?? undefined,
        }
      : { ...base, kind: 'single', note: undefined, options, other: undefined };
  }
  if (Schema.is(ElicitationBooleanProperty)(property)) {
    return { ...shared, default: property.default ?? undefined, kind: 'boolean' };
  }
  if (Schema.is(ElicitationNumberProperty)(property) || Schema.is(ElicitationIntegerProperty)(property)) {
    return {
      ...shared,
      default: property.default ?? undefined,
      kind: property.type,
      maximum: property.maximum ?? undefined,
      minimum: property.minimum ?? undefined,
    };
  }
  return { ...shared, kind: 'unsupported', type: 'unknown' };
};

const customAnswerQuestionId = (property: ElicitationPropertySchema): string | undefined => {
  const id = propertyMeta(property)?._askUserQuestionCustomAnswer?.questionId;
  return typeof id === 'string' ? id : undefined;
};

const noteQuestionId = (property: ElicitationPropertySchema): string | undefined => {
  const codex = propertyMeta(property)?.codex;
  return codex?.role === 'user_note' && typeof codex.questionId === 'string' ? codex.questionId : undefined;
};

/** Custom-answer fields pair with a choice question and are folded into it as its "Other" choice. */
export const elicitationFieldViews = (request: CreateElicitationFormRequest): readonly ElicitationFieldView[] => {
  const { properties, required } = request.requestedSchema;
  const entries = Object.entries(properties ?? {});
  const views = entries.map(([name, property]) => toView(name, property, required?.includes(name) ?? false));
  const choiceNames = new Set(views.filter(isChoiceView).map(view => view.name));
  const pair = (
    questionIdOf: (property: ElicitationPropertySchema) => string | undefined,
    skip: ReadonlySet<string>,
  ) => {
    const paired = new Map<string, ElicitationPairedField>();
    for (const [name, property] of entries) {
      const questionId = questionIdOf(property);
      if (questionId !== undefined && !skip.has(name) && choiceNames.has(questionId)) {
        paired.set(questionId, { name, placeholder: labelPair(name, property).label });
      }
    }
    return paired;
  };
  const others = pair(customAnswerQuestionId, new Set());
  const otherNames = new Set([...others.values()].map(other => other.name));
  const notes = pair(noteQuestionId, otherNames);
  const foldedNames = new Set([...otherNames, ...[...notes.values()].map(note => note.name)]);
  return views
    .filter(view => !foldedNames.has(view.name))
    .map(view => (isChoiceView(view) ? { ...view, note: notes.get(view.name), other: others.get(view.name) } : view));
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

const ipv4Octet = '(25[0-5]|2[0-4]\\d|1?\\d?\\d)';

const formatChecks: Readonly<Record<string, (value: string) => boolean>> = {
  date: value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)),
  'date-time': value => /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)),
  email: value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  hostname: value => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(value),
  ipv4: value => new RegExp(`^${ipv4Octet}(\\.${ipv4Octet}){3}$`).test(value),
  ipv6: value => value.includes(':') && URL.canParse(`http://[${value}]`),
  'uri-reference': value => /^\S+$/.test(value),
  uri: value => URL.canParse(value),
  uuid: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value),
};

const matchesPattern = (pattern: string, value: string): boolean => {
  try {
    return new RegExp(pattern, 'u').test(value);
  } catch {
    return true; // an unusable pattern can't be enforced client-side
  }
};

/** Message for a set text/number value that breaks the field's schema constraints; undefined when valid or unset. */
export const elicitationFieldError = (view: ElicitationFieldView, value: ElicitationValue): string | undefined => {
  if (view.kind === 'text' && typeof value === 'string' && value !== '') {
    if (view.minLength !== undefined && value.length < view.minLength) {
      return `At least ${view.minLength} characters`;
    }
    if (view.maxLength !== undefined && value.length > view.maxLength) {
      return `At most ${view.maxLength} characters`;
    }
    if (view.format !== undefined && !formatChecks[view.format]?.(value)) {
      return `Must be a valid ${view.format}`;
    }
    if (view.pattern !== undefined && !matchesPattern(view.pattern, value)) {
      return `Must match ${view.pattern}`;
    }
  }
  if ((view.kind === 'number' || view.kind === 'integer') && typeof value === 'number') {
    if (view.kind === 'integer' && !Number.isInteger(value)) {
      return 'Must be a whole number';
    }
    if (view.minimum !== undefined && value < view.minimum) {
      return `At least ${view.minimum}`;
    }
    if (view.maximum !== undefined && value > view.maximum) {
      return `At most ${view.maximum}`;
    }
  }
  return undefined;
};

export const canAcceptElicitation = (views: readonly ElicitationFieldView[], values: ElicitationValues): boolean =>
  views.every(view => {
    if (view.kind === 'unsupported') {
      return !view.required;
    }
    const value = values[view.name];
    const otherSet = isChoiceView(view) && view.other !== undefined && isSet(values[view.other.name]);
    const noteSet = isChoiceView(view) && view.note !== undefined && isSet(values[view.note.name]);
    if (view.kind === 'multi') {
      const count = (Array.isArray(value) ? value.length : 0) + (otherSet ? 1 : 0);
      if (count < (view.minItems ?? 0) || (view.maxItems !== undefined && count > view.maxItems)) {
        return false;
      }
      return !view.required || count > 0 || noteSet;
    }
    return elicitationFieldError(view, value) === undefined && (!view.required || isSet(value) || otherSet || noteSet);
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
  const options = isChoiceView(view) ? view.options : [];
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
    const other = isChoiceView(view) && view.other ? values[view.other.name] : undefined;
    const parts = [isSet(raw) ? formatValue(view, raw!) : undefined, isSet(other) ? String(other) : undefined].filter(
      part => part !== undefined,
    );
    const noteRaw = isChoiceView(view) && view.note ? values[view.note.name] : undefined;
    const note = isSet(noteRaw) ? String(noteRaw) : undefined;
    if (parts.length === 0) {
      return note === undefined ? [] : [{ caption: view.caption, label: view.label, note: undefined, value: note }];
    }
    return [{ caption: view.caption, label: view.label, note, value: parts.join(', ') }];
  });
