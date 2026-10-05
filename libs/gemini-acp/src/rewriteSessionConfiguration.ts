import { Option, Schema } from 'effect';

const ConfigOptionWithId = Schema.Struct({
  id: Schema.String,
});

const GeminiModelEntry = Schema.Struct({
  description: Schema.optionalKey(Schema.String),
  modelId: Schema.String,
  name: Schema.String,
});

const GeminiModels = Schema.Struct({
  availableModels: Schema.Array(GeminiModelEntry),
  currentModelId: Schema.String,
});

const GeminiModeEntry = Schema.Struct({
  description: Schema.optionalKey(Schema.String),
  id: Schema.String,
  name: Schema.String,
});

const GeminiModes = Schema.Struct({
  availableModes: Schema.Array(GeminiModeEntry),
  currentModeId: Schema.String,
});

const SessionConfigurationWire = Schema.StructWithRest(
  Schema.Struct({
    configOptions: Schema.optionalKey(Schema.Array(Schema.Unknown)),
    models: Schema.optionalKey(Schema.Unknown),
    modes: Schema.optionalKey(Schema.Unknown),
    sessionId: Schema.optionalKey(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

const decodeConfigOptionWithId = Schema.decodeUnknownOption(ConfigOptionWithId);
const decodeModels = Schema.decodeUnknownOption(GeminiModels);
const decodeModes = Schema.decodeUnknownOption(GeminiModes);
const decodeSessionConfigurationWire = Schema.decodeUnknownOption(SessionConfigurationWire);

const hasConfigOptionId = (configOptions: readonly unknown[], id: string): boolean =>
  configOptions.some(option => Option.getOrUndefined(decodeConfigOptionWithId(option))?.id === id);

type SelectConfigOption = {
  readonly category: 'mode' | 'model';
  readonly currentValue: string;
  readonly description: string;
  readonly id: 'mode' | 'model';
  readonly name: string;
  readonly options: readonly {
    readonly description?: string;
    readonly name: string;
    readonly value: string;
  }[];
  readonly type: 'select';
};

const selectConfigOption = (args: {
  readonly category: 'mode' | 'model';
  readonly currentValue: string;
  readonly description: string;
  readonly id: 'mode' | 'model';
  readonly name: string;
  readonly options: readonly {
    readonly description?: string;
    readonly name: string;
    readonly value: string;
  }[];
}): SelectConfigOption | undefined => {
  if (args.options.length === 0) {
    return undefined;
  }
  return {
    category: args.category,
    currentValue: args.currentValue,
    description: args.description,
    id: args.id,
    name: args.name,
    options: args.options,
    type: 'select',
  };
};

const modelConfigOptionFromModels = (models: unknown): SelectConfigOption | undefined => {
  const decoded = Option.getOrUndefined(decodeModels(models));
  if (decoded === undefined) {
    return undefined;
  }
  return selectConfigOption({
    category: 'model',
    currentValue: decoded.currentModelId,
    description: 'AI model to use',
    id: 'model',
    name: 'Model',
    options: decoded.availableModels.map(entry => ({
      name: entry.name,
      value: entry.modelId,
      ...(entry.description === undefined ? {} : { description: entry.description }),
    })),
  });
};

const modeConfigOptionFromModes = (modes: unknown): SelectConfigOption | undefined => {
  const decoded = Option.getOrUndefined(decodeModes(modes));
  if (decoded === undefined) {
    return undefined;
  }
  return selectConfigOption({
    category: 'mode',
    currentValue: decoded.currentModeId,
    description: 'Session permission mode',
    id: 'mode',
    name: 'Mode',
    options: decoded.availableModes.map(entry => ({
      name: entry.name,
      value: entry.id,
      ...(entry.description === undefined ? {} : { description: entry.description }),
    })),
  });
};

export type GeminiSessionConfigSnapshot = {
  readonly models?: typeof GeminiModels.Type;
  readonly modes?: typeof GeminiModes.Type;
};

export type RewrittenSessionConfiguration = {
  readonly configOptions: readonly unknown[];
  readonly modes?: unknown;
  readonly sessionId?: string;
};

/** Capture Gemini legacy models/modes for later set_config_option rebuilds. */
export const snapshotSessionConfig = (result: unknown): GeminiSessionConfigSnapshot => {
  const wire = Option.getOrUndefined(decodeSessionConfigurationWire(result));
  if (wire === undefined) {
    return {};
  }
  const models = Option.getOrUndefined(decodeModels(wire.models));
  const modes = Option.getOrUndefined(decodeModes(wire.modes));
  return {
    ...(modes === undefined ? {} : { modes }),
    ...(models === undefined ? {} : { models }),
  };
};

export const withModelId = (snapshot: GeminiSessionConfigSnapshot, modelId: string): GeminiSessionConfigSnapshot => {
  if (snapshot.models === undefined) {
    return snapshot;
  }
  return { ...snapshot, models: { ...snapshot.models, currentModelId: modelId } };
};

export const withModeId = (snapshot: GeminiSessionConfigSnapshot, modeId: string): GeminiSessionConfigSnapshot => {
  if (snapshot.modes === undefined) {
    return snapshot;
  }
  return { ...snapshot, modes: { ...snapshot.modes, currentModeId: modeId } };
};

/**
 * Client-facing session config: synthesize ACP `configOptions` from Gemini `models` / `modes`
 * when those ids are missing; drop `models` so Clients see stable config options only.
 */
export const rewriteSessionConfiguration = (result: unknown): RewrittenSessionConfiguration => {
  const wire = Option.getOrUndefined(decodeSessionConfigurationWire(result));
  if (wire === undefined) {
    return { configOptions: [] };
  }

  const existing = wire.configOptions ?? [];
  const synthesized: unknown[] = [];

  if (!hasConfigOptionId(existing, 'mode')) {
    const modeOption = modeConfigOptionFromModes(wire.modes);
    if (modeOption !== undefined) {
      synthesized.push(modeOption);
    }
  }

  if (!hasConfigOptionId(existing, 'model')) {
    const modelOption = modelConfigOptionFromModels(wire.models);
    if (modelOption !== undefined) {
      synthesized.push(modelOption);
    }
  }

  const { configOptions: _configOptions, models: _models, ...rest } = wire;

  return {
    ...rest,
    configOptions: [...synthesized, ...existing],
    ...(wire.sessionId === undefined ? {} : { sessionId: wire.sessionId }),
  };
};

/** Rebuild Client-facing configOptions from a stored Gemini snapshot (after set_model / set_mode). */
export const configOptionsFromSnapshot = (
  snapshot: GeminiSessionConfigSnapshot,
): { readonly configOptions: readonly unknown[] } => {
  const rewritten = rewriteSessionConfiguration({
    ...(snapshot.modes === undefined ? {} : { modes: snapshot.modes }),
    ...(snapshot.models === undefined ? {} : { models: snapshot.models }),
  });
  return { configOptions: rewritten.configOptions };
};
