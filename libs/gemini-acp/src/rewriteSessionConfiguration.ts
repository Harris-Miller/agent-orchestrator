const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasConfigOptionId = (configOptions: readonly unknown[], id: string): boolean =>
  configOptions.some(option => isPlainObject(option) && option.id === id);

const modelConfigOptionFromModels = (models: unknown): Record<string, unknown> | undefined => {
  if (!isPlainObject(models) || typeof models.currentModelId !== 'string' || !Array.isArray(models.availableModels)) {
    return undefined;
  }

  const options = models.availableModels.flatMap(entry => {
    if (!isPlainObject(entry) || typeof entry.modelId !== 'string' || typeof entry.name !== 'string') {
      return [];
    }
    return [
      {
        name: entry.name,
        value: entry.modelId,
        ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      },
    ];
  });

  if (options.length === 0) {
    return undefined;
  }

  return {
    category: 'model',
    currentValue: models.currentModelId,
    description: 'AI model to use',
    id: 'model',
    name: 'Model',
    options,
    type: 'select',
  };
};

const modeConfigOptionFromModes = (modes: unknown): Record<string, unknown> | undefined => {
  if (!isPlainObject(modes) || typeof modes.currentModeId !== 'string' || !Array.isArray(modes.availableModes)) {
    return undefined;
  }

  const options = modes.availableModes.flatMap(entry => {
    if (!isPlainObject(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      return [];
    }
    return [
      {
        name: entry.name,
        value: entry.id,
        ...(typeof entry.description === 'string' ? { description: entry.description } : {}),
      },
    ];
  });

  if (options.length === 0) {
    return undefined;
  }

  return {
    category: 'mode',
    currentValue: modes.currentModeId,
    description: 'Session permission mode',
    id: 'mode',
    name: 'Mode',
    options,
    type: 'select',
  };
};

export type GeminiSessionConfigSnapshot = {
  readonly models?: unknown;
  readonly modes?: unknown;
};

export type RewrittenSessionConfiguration = {
  readonly configOptions: readonly unknown[];
  readonly modes?: unknown;
  readonly sessionId?: string;
};

/** Capture Gemini legacy models/modes for later set_config_option rebuilds. */
export const snapshotSessionConfig = (result: unknown): GeminiSessionConfigSnapshot => {
  if (!isPlainObject(result)) {
    return {};
  }
  return {
    ...(result.modes === undefined ? {} : { modes: result.modes }),
    ...(result.models === undefined ? {} : { models: result.models }),
  };
};

export const withModelId = (snapshot: GeminiSessionConfigSnapshot, modelId: string): GeminiSessionConfigSnapshot => {
  if (!isPlainObject(snapshot.models)) {
    return snapshot;
  }
  return { ...snapshot, models: { ...snapshot.models, currentModelId: modelId } };
};

export const withModeId = (snapshot: GeminiSessionConfigSnapshot, modeId: string): GeminiSessionConfigSnapshot => {
  if (!isPlainObject(snapshot.modes)) {
    return snapshot;
  }
  return { ...snapshot, modes: { ...snapshot.modes, currentModeId: modeId } };
};

/**
 * Client-facing session config: synthesize ACP `configOptions` from Gemini `models` / `modes`
 * when those ids are missing; drop `models` so Clients see stable config options only.
 */
export const rewriteSessionConfiguration = (result: unknown): RewrittenSessionConfiguration => {
  if (!isPlainObject(result)) {
    return { configOptions: [] };
  }

  const rawOptions = result.configOptions;
  const existing: unknown[] = Array.isArray(rawOptions) ? (rawOptions as unknown[]) : [];
  const synthesized: unknown[] = [];

  if (!hasConfigOptionId(existing, 'mode')) {
    const modeOption = modeConfigOptionFromModes(result.modes);
    if (modeOption !== undefined) {
      synthesized.push(modeOption);
    }
  }

  if (!hasConfigOptionId(existing, 'model')) {
    const modelOption = modelConfigOptionFromModels(result.models);
    if (modelOption !== undefined) {
      synthesized.push(modelOption);
    }
  }

  const { models: _models, ...rest } = result;

  return {
    ...rest,
    configOptions: [...synthesized, ...existing],
    ...(typeof result.sessionId === 'string' ? { sessionId: result.sessionId } : {}),
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
