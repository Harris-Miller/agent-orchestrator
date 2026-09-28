import { Schema } from 'effect';

/**
 * User settings schema: known preference fields + passthrough unknown keys.
 */
export const UserSettingsSchema = Schema.StructWithRest(
  Schema.Struct({
    confirmSessionDelete: Schema.optionalKey(Schema.Boolean),
    developerModeEnabled: Schema.optionalKey(Schema.Boolean),
    theme: Schema.optionalKey(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

export type UserSettings = typeof UserSettingsSchema.Type;

export const defaultSettings: UserSettings = {};

/** JSON string codec for user settings (pretty-printed). */
export const UserSettingsJsonString = Schema.fromJsonString(UserSettingsSchema, { space: 2 });
