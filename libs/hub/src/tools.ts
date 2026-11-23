/**
 * The tools the hub advertises to agents. The hub owns these schemas (agents list tools before any call is routed), but
 * not their logic: every handler forwards to the Harness that owns the caller's credential.
 */
import { Effect, Schema } from 'effect';
import { Tool, Toolkit } from 'effect/ai';
import type { AiError } from 'effect/ai';

import {
  CancelSubagentArgs,
  HUB_TOOL_NAMES,
  SpawnSubagentArgs,
  SubmitHandoffArgs,
  WaitSubagentArgs,
} from './protocol.ts';
import type { HubToolName } from './protocol.ts';
import type { CallResult } from './state.ts';

const forwarded = { failure: Schema.String, failureMode: 'return', success: Schema.String } as const;

export const SubmitHandoff = Tool.make('submit_handoff', {
  ...forwarded,
  description:
    'Deliver the handoff document you were asked to write. Call this exactly once, with the full document, only when the user or Harness asked you to prepare a handoff.',
  parameters: SubmitHandoffArgs,
});

export const ListSubagentTargets = Tool.make('list_subagent_targets', {
  ...forwarded,
  description:
    "List the agent launch targets (providers) you can start a subagent on, your own included, with each one's models and their selectable config options (effort, mode, ...) and values. Call this before choosing a launch target or config options.",
  parameters: Tool.EmptyParams,
});

export const SpawnSubagent = Tool.make('spawn_subagent', {
  ...forwarded,
  description:
    'Start a subagent on any listed agent launch target (provider), including your own, and wait for it. Pick its model and config options from list_subagent_targets. The subagent starts in your working directory with only the task you give it, and its final message is the result. If it is still running after a few minutes this returns a <subagent> element with its id and status running: then call wait_subagent.',
  parameters: SpawnSubagentArgs,
});

export const CancelSubagent = Tool.make('cancel_subagent', {
  ...forwarded,
  description:
    "Cancel a subagent's current work (stop it). Only subagents you started with spawn_subagent. A cancelled subagent reports status cancelled.",
  parameters: CancelSubagentArgs,
});

export const WaitSubagent = Tool.make('wait_subagent', {
  ...forwarded,
  description:
    "Wait for subagents you started with spawn_subagent (by id) and get each one's final message, or its status if it is still running after the wait. Only your own subagents.",
  parameters: WaitSubagentArgs,
});

export const HubToolkit = Toolkit.make(SubmitHandoff, ListSubagentTargets, SpawnSubagent, CancelSubagent, WaitSubagent);

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
