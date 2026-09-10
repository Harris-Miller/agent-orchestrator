import { Schema } from 'effect';

/**
 * Settings document schema: empty known fields + passthrough unknown keys.
 * Later tickets add typed fields on the inner Struct.
 */
export const SettingsDocumentSchema = Schema.StructWithRest(Schema.Struct({}), [
  Schema.Record(Schema.String, Schema.Unknown),
]);

export type SettingsDocument = typeof SettingsDocumentSchema.Type;

export const defaultSettings: SettingsDocument = {};

/** JSON string codec for the settings document (pretty-printed). */
export const SettingsDocumentJsonString = Schema.fromJsonString(SettingsDocumentSchema, { space: 2 });
