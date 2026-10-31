/**
 * Controlled spawn env for managed Antigravity ACP — scrub ambient Google / AGY keys.
 * Sets capture-only `BROWSER` helper; Host OpenUrl opens the auth URL (#174).
 */

const removedEnvironmentKeys = new Set([
  'AGY_ACP_CCPA_PROJECT',
  'AGY_ACP_ENABLE_OAUTH',
  'AGY_ACP_FORCE_FILE_STORAGE',
  'ANTIGRAVITY_HARNESS_PATH',
  'BROWSER',
  'CLOUDSDK_CORE_PROJECT',
  'ELECTRON_RUN_AS_NODE',
  'GCLOUD_PROJECT',
  'GEMINI_API_KEY',
  'GEMINI_HOME',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_CLOUD_LOCATION',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_QUOTA_PROJECT',
  'GOOGLE_GENAI_USE_VERTEXAI',
  'PYTHONUNBUFFERED',
]);

const shouldScrubKey = (key: string): boolean => {
  const upper = key.toUpperCase();
  return removedEnvironmentKeys.has(upper) || upper.startsWith('AGY_ACP_') || upper.startsWith('GEMINI_');
};

export type AntigravitySpawnEnvInput = {
  readonly antigravityAcpHome: string;
  readonly baseEnv: Readonly<Record<string, string | undefined>>;
  readonly browserHelperPath: string;
  readonly harnessPath: string;
  readonly platform: string;
};

/** Scrub ambient keys, then set controlled GEMINI_HOME / BROWSER / force-file-storage / harness path. */
export const buildAntigravitySpawnEnv = (input: AntigravitySpawnEnvInput): Record<string, string> => {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.baseEnv)) {
    if (value !== undefined && !shouldScrubKey(key)) {
      environment[key] = value;
    }
  }

  return {
    ...environment,
    AGY_ACP_FORCE_FILE_STORAGE: '1',
    ANTIGRAVITY_HARNESS_PATH: input.harnessPath,
    BROWSER: input.browserHelperPath,
    ELECTRON_RUN_AS_NODE: '1',
    GEMINI_HOME: input.antigravityAcpHome,
    PYTHONUNBUFFERED: '1',
  };
};
