/** The shape of a Harness-side hub tool handler, kept apart so feature modules can define one without import cycles. */
import { Effect, Schema } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

/** The session whose credential made the call (the agent never names itself). */
export type HubToolCaller = { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string };

export type HubToolResult = { readonly isError: boolean; readonly text: string };

export type HubToolHandler = (args: unknown, caller: HubToolCaller) => Effect.Effect<HubToolResult>;

export const toolError = (text: string): HubToolResult => ({ isError: true, text });

/** A handler whose `args` are decoded with the same schema the hub advertised; bad args become a tool error. */
export const hubToolHandler =
  <A>(
    schema: Schema.Decoder<A>,
    run: (args: A, caller: HubToolCaller) => Effect.Effect<HubToolResult>,
  ): HubToolHandler =>
  (args, caller) =>
    Schema.decodeUnknownEffect(schema)(args).pipe(
      Effect.matchEffect({
        onFailure: error => Effect.succeed(toolError(`Invalid arguments: ${error.message}`)),
        onSuccess: decoded => run(decoded, caller),
      }),
    );
