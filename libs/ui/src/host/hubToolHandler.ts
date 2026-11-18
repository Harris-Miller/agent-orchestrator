/** The shape of a Harness-side hub tool handler, kept apart so feature modules can define one without import cycles. */
import type { HostServices } from '@lib/context-services';
import { Effect, Schema } from 'effect';
import type { AtomRegistry } from 'effect/reactivity';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

/** The session whose credential made the call (the agent never names itself). */
export type HubToolCaller = { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string };

export type HubToolResult = { readonly isError: boolean; readonly text: string };

/** What the Harness gives every handler besides the call itself: the app's atom registry (the one `hubAtom` runs in). */
export type HubToolContext = {
  readonly registry: AtomRegistry.AtomRegistry;
};

export type HubToolHandler = (
  args: unknown,
  caller: HubToolCaller,
  ctx: HubToolContext,
) => Effect.Effect<HubToolResult, never, HostServices>;

export const toolError = (text: string): HubToolResult => ({ isError: true, text });

/** A handler whose `args` are decoded with the same schema the hub advertised; bad args become a tool error. */
export const hubToolHandler =
  <A>(
    schema: Schema.Decoder<A>,
    run: (args: A, caller: HubToolCaller, ctx: HubToolContext) => Effect.Effect<HubToolResult, never, HostServices>,
  ): HubToolHandler =>
  (args, caller, ctx) =>
    Schema.decodeUnknownEffect(schema)(args).pipe(
      Effect.matchEffect({
        onFailure: error => Effect.succeed(toolError(`Invalid arguments: ${error.message}`)),
        onSuccess: decoded => run(decoded, caller, ctx),
      }),
    );
