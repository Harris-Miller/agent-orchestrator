/**
 * Agent capabilities: what the Harness may use on one Backend connection, read once from the initialize result and
 * already narrowed per Provider. Also the initialize request's client capabilities (the AIR offer), so both halves of
 * the handshake live here.
 *
 * Not the ACP `agentCapabilities` wire field, nor `@libs/effect-acp`'s opaque `AgentCapabilities` schema: this record
 * also reads top-level `_meta` (Steering, AIR) and applies Provider quirks.
 */
import type { InitializeRequest } from '@libs/effect-acp';
import { Effect, Option, Predicate, Schema } from 'effect';

import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { agentLaunchTargetLabel } from './agentLaunchTarget.ts';
import { airCapability, airMeta } from './airMeta.ts';

const AGENT_CAPABILITY_KEYS = [
  'promptEmbeddedContext',
  'promptImage',
  'sessionArchive',
  'sessionClose',
  'sessionFork',
  'sessionRename',
  'sessionResume',
  'steering',
] as const;

export type AgentCapability = (typeof AGENT_CAPABILITY_KEYS)[number];

/**
 * - `promptEmbeddedContext` / `promptImage`: `agentCapabilities.promptCapabilities.*`
 * - `sessionArchive` / `sessionRename`: AIR `_meta.jetbrains.air.capabilities`
 * - `sessionClose` / `sessionFork` / `sessionResume`: `agentCapabilities.sessionCapabilities.*` (resume minus never-resume Providers)
 * - `steering`: top-level `_meta.steering.supported === true`
 */
export type AgentCapabilities = Readonly<Record<AgentCapability, boolean>>;

export const NO_AGENT_CAPABILITIES: AgentCapabilities = {
  promptEmbeddedContext: false,
  promptImage: false,
  sessionArchive: false,
  sessionClose: false,
  sessionFork: false,
  sessionRename: false,
  sessionResume: false,
  steering: false,
};

type ProviderQuirks = {
  /** Offer AIR `sessionIndex` in initialize (Archive / Rename are only answered when offered). */
  readonly airClient: boolean;
  /** Never `session/resume`, whatever is advertised (desktop ADR-0013: Cursor until resume is proven). */
  readonly neverResume: boolean;
};

const PROVIDER_QUIRKS: Readonly<Record<AgentLaunchTarget, ProviderQuirks>> = {
  'antigravity-acp': { airClient: false, neverResume: false },
  'claude-agent-acp': { airClient: true, neverResume: false },
  'codex-acp': { airClient: true, neverResume: false },
  'cursor-acp': { airClient: false, neverResume: true },
};

/** Value at `path`, or undefined when any step is not an object. */
const at = (value: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>((node, key) => (Predicate.isObject(node) ? node[key] : undefined), value);

/** ACP capabilities are `true` or a (possibly growing) object; anything else is unsupported. */
const isAdvertised = (value: unknown): boolean => value === true || Predicate.isObject(value);

const decodeStrings = Schema.decodeUnknownOption(Schema.Array(Schema.String));

const airCapabilities = (initializeResult: unknown): readonly string[] =>
  Option.getOrElse(decodeStrings(at(initializeResult, ['_meta', 'jetbrains', 'air', 'capabilities'])), () => []);

/** Read once per initialize. Total: never throws; any non-object input reads as `NO_AGENT_CAPABILITIES`. */
export const agentCapabilitiesFrom = (
  launchTarget: AgentLaunchTarget,
  initializeResult: unknown,
): AgentCapabilities => {
  const prompt = (key: string) => isAdvertised(at(initializeResult, ['agentCapabilities', 'promptCapabilities', key]));
  const session = (key: string) =>
    isAdvertised(at(initializeResult, ['agentCapabilities', 'sessionCapabilities', key]));
  const air = airCapabilities(initializeResult);
  return {
    promptEmbeddedContext: prompt('embeddedContext'),
    promptImage: prompt('image'),
    sessionArchive: air.includes(airCapability.sessionArchive),
    sessionClose: session('close'),
    sessionFork: session('fork'),
    sessionRename: air.includes(airCapability.sessionRename),
    sessionResume: !PROVIDER_QUIRKS[launchTarget].neverResume && session('resume'),
    steering: at(initializeResult, ['_meta', 'steering', 'supported']) === true,
  };
};

/** `clientCapabilities` for this launch target's initialize request (AIR `sessionIndex` offer for Claude / Codex). */
export const clientCapabilitiesFor = (launchTarget: AgentLaunchTarget): InitializeRequest['clientCapabilities'] => ({
  ...(PROVIDER_QUIRKS[launchTarget].airClient
    ? { _meta: airMeta({ capabilities: [airCapability.sessionIndex] }) }
    : {}),
  elicitation: { form: {} },
  session: { configOptions: { boolean: {} } },
  subagents: {},
});

export class AgentCapabilityMissing extends Schema.TaggedError<AgentCapabilityMissing>()('AgentCapabilityMissing', {
  capability: Schema.Literals(AGENT_CAPABILITY_KEYS),
  launchTarget: Schema.String,
  message: Schema.String,
}) {}

/** Fails with `AgentCapabilityMissing` unless `capabilities[capability]`. No side effects. */
export const requireAgentCapability = (
  capabilities: AgentCapabilities,
  launchTarget: AgentLaunchTarget,
  capability: AgentCapability,
): Effect.Effect<void, AgentCapabilityMissing> =>
  capabilities[capability]
    ? Effect.void
    : Effect.fail(
        new AgentCapabilityMissing({
          capability,
          launchTarget,
          message: `${agentLaunchTargetLabel(launchTarget)} does not support ${capability}`,
        }),
      );
