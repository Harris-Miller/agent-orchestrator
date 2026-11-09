import { Schema } from 'effect';

/**
 * User settings schema: known preference fields + passthrough unknown keys.
 */
export const UserSettingsSchema = Schema.StructWithRest(
  Schema.Struct({
    alwaysHiddenGlobs: Schema.optionalKey(Schema.Array(Schema.String)),
    confirmSessionDelete: Schema.optionalKey(Schema.Boolean),
    developerModeEnabled: Schema.optionalKey(Schema.Boolean),
    keepAwakeEnabled: Schema.optionalKey(Schema.Boolean),
    notificationSoundEnabled: Schema.optionalKey(Schema.Boolean),
    notificationsEnabled: Schema.optionalKey(Schema.Boolean),
    notifyOnlyWhenUnfocused: Schema.optionalKey(Schema.Boolean),
    providerEnabled: Schema.optionalKey(Schema.Record(Schema.String, Schema.Boolean)),
    skippedExtensionVersion: Schema.optionalKey(Schema.String),
    showArchived: Schema.optionalKey(Schema.Boolean),
    showProvidersOnStartup: Schema.optionalKey(Schema.Boolean),
    showNoFolderGroup: Schema.optionalKey(Schema.Boolean),
    theme: Schema.optionalKey(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

export type UserSettings = typeof UserSettingsSchema.Type;

export const defaultSettings: UserSettings = {};

const EMPTY_ALWAYS_HIDDEN_GLOBS: readonly string[] = [];

/** Trim, drop empties, dedupe (first wins). Unset / empty → `[]`. */
export const normalizeAlwaysHiddenGlobs = (globs: readonly string[] | undefined): readonly string[] => {
  if (globs === undefined || globs.length === 0) {
    return EMPTY_ALWAYS_HIDDEN_GLOBS;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of globs) {
    const trimmed = raw.trim();
    if (trimmed.length > 0 && !seen.has(trimmed)) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out.length === 0 ? EMPTY_ALWAYS_HIDDEN_GLOBS : out;
};

/** JSON string codec for user settings (pretty-printed). */
export const UserSettingsJsonString = Schema.fromJsonString(UserSettingsSchema, { space: 2 });
