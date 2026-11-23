/**
 * Spawned subagent sessions (libs/ui ADR 0011): a child the Harness starts on any usable launch target (including the parent's own) for a parent, from
 * spawn to its outcome reaching the parent's agent (a tool result, or a Subagent report) and its end with the parent.
 * The interface: the agent-facing verbs, ending a parent's children, Connection lost, and read-only link queries.
 */
export { cancelSubagent, spawnSubagent, waitSubagents } from './tools.ts';
export type { SpawnSubagentRequest } from './tools.ts';
export { endSpawnedChildren, onLaunchTargetConnectionLost, spawnedParentOf } from './lifecycle.ts';
export { isChild, isChildIn, subagentLinksAtom } from './links.ts';
export type { SubagentOutcome } from './links.ts';
