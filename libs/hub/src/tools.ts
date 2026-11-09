/**
 * The tools the hub advertises to agents. The hub owns these schemas (agents list tools before any call is routed), but
 * not their logic: every handler forwards to the Harness that owns the caller's credential.
 */
import { Effect, Schema } from 'effect';
import { Tool, Toolkit } from 'effect/ai';
import type { AiError } from 'effect/ai';

import { HUB_TOOL_NAMES, SubmitHandoffArgs } from './protocol.ts';
import type { HubToolName } from './protocol.ts';
import type { CallResult } from './state.ts';

const forwarded = { failure: Schema.String, failureMode: 'return', success: Schema.String } as const;

export const SubmitHandoff = Tool.make('submit_handoff', {
  ...forwarded,
  description:
    'Deliver the handoff document you were asked to write. Call this exactly once, with the full document, only when the user or Harness asked you to prepare a handoff.',
  parameters: SubmitHandoffArgs,
});

export const HubToolkit = Toolkit.make(SubmitHandoff);

type Handlers = Toolkit.HandlersFrom<typeof HubToolkit.tools>;

/** A forwarding handler per tool: `forward` routes the call and its result becomes the tool result. */
export const forwardingHandlers = (
  forward: (tool: HubToolName, args: unknown) => Effect.Effect<CallResult>,
): Handlers => {
  const handler =
    (tool: HubToolName) =>
    (args: unknown): Effect.Effect<string, string | AiError.AiError> =>
      Effect.flatMap(forward(tool, args), result =>
        result.isError ? Effect.fail(result.text) : Effect.succeed(result.text),
      );
  // Same shape for every tool (decoded params in, text out), so one generic handler fits each key of the toolkit.
  return Object.fromEntries(HUB_TOOL_NAMES.map(name => [name, handler(name)])) as unknown as Handlers;
};
