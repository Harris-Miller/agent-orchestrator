import { Schema } from 'effect';

const OptionalString = Schema.optionalKey(Schema.UndefinedOr(Schema.String));
const Choice = Schema.Struct({ id: Schema.String, name: Schema.String, description: OptionalString });
const SelectOption = Schema.Struct({
  type: Schema.Literal('select'),
  id: Schema.String,
  name: Schema.String,
  category: OptionalString,
  description: OptionalString,
  choices: Schema.Array(Choice),
  currentValue: Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
  recommendedValue: Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
});
const BooleanOption = Schema.Struct({
  type: Schema.Literal('boolean'),
  id: Schema.String,
  name: Schema.String,
  category: OptionalString,
  description: OptionalString,
  currentValue: Schema.optionalKey(Schema.UndefinedOr(Schema.Boolean)),
});
export const ConfigOptionIndexDocumentSchema = Schema.Struct({
  defaultModelId: Schema.String,
  unavailableModelIds: Schema.Array(Schema.String),
  byModel: Schema.Record(Schema.String, Schema.Array(Schema.Union([SelectOption, BooleanOption]))),
});
export type ConfigOptionIndexDocument = typeof ConfigOptionIndexDocumentSchema.Type;
export const ConfigOptionIndexDocumentJsonString = Schema.fromJsonString(ConfigOptionIndexDocumentSchema, { space: 2 });
