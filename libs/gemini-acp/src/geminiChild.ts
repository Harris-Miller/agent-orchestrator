import { ChildProcess } from 'effect/unstable/process';

const pipedSpawnOptions = {
  extendEnv: true,
  stderr: 'inherit' as const,
  stdin: 'pipe' as const,
  stdout: 'pipe' as const,
};

/** Command for the Gemini child: Vendor CLI `gemini --acp` on PATH. */
export const makeGeminiChildCommand = () => ChildProcess.make('gemini', ['--acp'], pipedSpawnOptions);
