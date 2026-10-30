import { Schema } from 'effect';

/** kebab-case agent launch target (`antigravity-acp`, `codex-acp`, …). */
export const LaunchTargetSchema = Schema.String.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).pipe(
  Schema.brand('LaunchTarget'),
);

export type LaunchTarget = typeof LaunchTargetSchema.Type;
