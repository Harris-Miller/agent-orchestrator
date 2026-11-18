/**
 * Every hub tool's Harness handler. Keyed by the protocol's tool names, so a tool the hub declares without a handler
 * here (or a handler for a tool it does not declare) fails to compile. Adding a tool: its argument schema and name in
 * `@lib/hub/protocol`, its `Tool.make` in the hub's `tools.ts`, and its handler here.
 */
import type { HubToolName } from '@lib/hub/protocol';

import { submitHandoffHandler } from './handoffSubmission.ts';
import type { HubToolHandler } from './hubToolHandler.ts';
import {
  cancelSubagentHandler,
  listSubagentTargetsHandler,
  spawnSubagentHandler,
  waitSubagentHandler,
} from './spawnSubagentHandler.ts';

export const HUB_TOOL_HANDLERS: Readonly<Record<HubToolName, HubToolHandler>> = {
  cancel_subagent: cancelSubagentHandler,
  list_subagent_targets: listSubagentTargetsHandler,
  spawn_subagent: spawnSubagentHandler,
  submit_handoff: submitHandoffHandler,
  wait_subagent: waitSubagentHandler,
};
