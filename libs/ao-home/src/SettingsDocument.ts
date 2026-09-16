import { Schema } from 'effect';

/**
 * Settings document schema: known preference fields + passthrough unknown keys.
 */
export const SettingsDocumentSchema = Schema.StructWithRest(
  Schema.Struct({
    confirmSessionDelete: Schema.optionalKey(Schema.Boolean),
    harnessConfigDefaults: Schema.optionalKey(
      Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String)),
    ),
    theme: Schema.optionalKey(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

export type SettingsDocument = typeof SettingsDocumentSchema.Type;

export const defaultSettings: SettingsDocument = {};

/** JSON string codec for the settings document (pretty-printed). */
export const SettingsDocumentJsonString = Schema.fromJsonString(SettingsDocumentSchema, { space: 2 });
