/**
 * Per-session hub credentials. Each session the Harness creates or loads gets its own bearer token, injected as the
 * hub MCP server on that session RPC; a tool call routed back from the hub names its session by that token. Also
 * records, per session, whether it got a credential and why not, so the UI can disable MCP-backed actions with a reason.
 */
import { HUB_TOOL_NAMES, MCP_SERVER_NAME } from '@lib/hub/protocol';
import type { HubToolName } from '@lib/hub/protocol';
import type { HostServices } from '@lib/context-services';
import type { McpServer } from '@libs/effect-acp';
import { Duration, Effect } from 'effect';

import { mcpToolPreapprovalMeta } from './agentCapabilities.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';
import { agentLaunchTargetLabel } from './agentLaunchTarget.ts';
import { awaitHub, currentHub, hubAvailability } from './hubConnection.ts';
import type { HubAvailability } from './hubConnection.ts';
import { toolError } from './hubToolHandler.ts';
import type { HubToolContext, HubToolResult } from './hubToolHandler.ts';
import { HUB_TOOL_HANDLERS } from './hubTools.ts';

/** How long a session RPC waits for a hub that is still connecting (startup, or a hub being started). */
const SETTLE_TIMEOUT = Duration.seconds(5);

type Credential = {
  readonly launchTarget: AgentLaunchTarget;
  /** The parent's ACP `sessionId` when this credential belongs to a Spawned subagent session. */
  readonly parentSessionId?: string;
  /** Undefined until the session RPC responds (`session/new` has no id before that). */
  sessionId: string | undefined;
};

const credentials = new Map<string, Credential>();

/** A session's hub status: bound to a credential, or the reason it has none. */
export type SessionHubStatus = { readonly _tag: 'bound' } | { readonly _tag: 'none'; readonly reason: string };

const sessionKey = (launchTarget: AgentLaunchTarget, sessionId: string) => `${launchTarget}\u0000${sessionId}`;

let statuses: ReadonlyMap<string, SessionHubStatus> = new Map();
const statusListeners = new Set<(next: ReadonlyMap<string, SessionHubStatus>) => void>();

const publishStatuses = (next: ReadonlyMap<string, SessionHubStatus>) => {
  statuses = next;
  for (const listener of statusListeners) {
    listener(next);
  }
};

const setStatus = (launchTarget: AgentLaunchTarget, sessionId: string, status: SessionHubStatus | undefined) => {
  const next = new Map(statuses);
  if (status === undefined) {
    next.delete(sessionKey(launchTarget, sessionId));
  } else {
    next.set(sessionKey(launchTarget, sessionId), status);
  }
  publishStatuses(next);
};

export const sessionHubStatuses = (): ReadonlyMap<string, SessionHubStatus> => statuses;

export const onSessionHubStatuses = (listener: (next: ReadonlyMap<string, SessionHubStatus>) => void): (() => void) => {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
};

/**
 * Why MCP-backed actions (Handoff) cannot run for this session right now, or undefined when they can. Pure over its
 * inputs so atoms and the Handoff gate agree.
 */
export const hubUnavailableReason = (
  availability: HubAvailability,
  sessionStatuses: ReadonlyMap<string, SessionHubStatus>,
  launchTarget: AgentLaunchTarget,
  sessionId: string,
): string | undefined => {
  if (availability._tag === 'unavailable') {
    return availability.reason;
  }
  if (availability._tag === 'connecting') {
    return 'Connecting to the HOA hub…';
  }
  const status = sessionStatuses.get(sessionKey(launchTarget, sessionId));
  if (status === undefined) {
    return 'This session has no hub connection. Reopen it to connect.';
  }
  return status._tag === 'none' ? status.reason : undefined;
};

/** {@link hubUnavailableReason} against the current module state. */
export const currentHubUnavailableReason = (launchTarget: AgentLaunchTarget, sessionId: string): string | undefined =>
  hubUnavailableReason(hubAvailability(), statuses, launchTarget, sessionId);

/** Every credential this Harness owns, for re-registering after a hub restart. */
export const registeredTokens = (): readonly {
  readonly launchTarget: AgentLaunchTarget;
  readonly parentSessionId?: string;
  readonly sessionId: string | undefined;
  readonly token: string;
}[] => [...credentials].map(([token, credential]) => ({ ...credential, token }));

const mintToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
};

const revokeWhere = (matches: (credential: Credential, token: string) => boolean): Effect.Effect<void> =>
  Effect.gen(function* () {
    const hub = currentHub();
    for (const [token, credential] of credentials) {
      if (matches(credential, token)) {
        credentials.delete(token);
        if (hub !== undefined) {
          yield* hub.revoke(token);
        }
      }
    }
  });

/** Revoke `sessionId`'s credentials (on close and delete); it no longer counts as connected. */
export const revokeSessionMcp = (launchTarget: AgentLaunchTarget, sessionId: string): Effect.Effect<void> =>
  Effect.andThen(
    revokeWhere(credential => credential.launchTarget === launchTarget && credential.sessionId === sessionId),
    Effect.sync(() => {
      setStatus(launchTarget, sessionId, undefined);
    }),
  );

/** Revoke every credential of a launch target whose Backend connection is gone (its sessions died with it). */
export const revokeLaunchTargetMcp = (launchTarget: AgentLaunchTarget): Effect.Effect<void> =>
  Effect.andThen(
    revokeWhere(credential => credential.launchTarget === launchTarget),
    Effect.sync(() => {
      const prefix = sessionKey(launchTarget, '');
      publishStatuses(new Map([...statuses].filter(([key]) => !key.startsWith(prefix))));
    }),
  );

/** What one session RPC's params carry for the hub: its MCP servers, and any provider `_meta` that goes with them. */
export type McpParams = { readonly _meta?: Record<string, unknown>; readonly mcpServers: McpServer[] };

/** The hub's part of one session RPC's params, plus how to finish (bind) or undo (abandon) the credential behind it. */
export type McpInjection = {
  readonly abandon: Effect.Effect<void>;
  /** Record the session's status once its id is known (the RPC succeeded). */
  readonly bind: (sessionId: string) => Effect.Effect<void>;
  /** Spread into the session RPC's params. */
  readonly params: McpParams;
};

/** No MCP server for this session; once it exists, it is recorded as unconnected with `reason`. */
const noMcp = (launchTarget: AgentLaunchTarget, reason: string): McpInjection => ({
  abandon: Effect.void,
  // A load / resume with no hub still ends the session's previous credential.
  bind: sessionId =>
    Effect.andThen(
      revokeWhere(credential => credential.launchTarget === launchTarget && credential.sessionId === sessionId),
      Effect.sync(() => {
        setStatus(launchTarget, sessionId, { _tag: 'none', reason });
      }),
    ),
  params: { mcpServers: [] },
});

/**
 * Register a fresh credential before a session RPC and describe the hub as that RPC's `mcpServers` entry (the ACP wire shape). Injects nothing
 * unless the hub is connected and the Agent advertises HTTP MCP (`mcpCapabilities.http`); a hub still connecting gets
 * a few seconds to settle first.
 */
export const beginMcp = Effect.fnUntraced(function* (
  launchTarget: AgentLaunchTarget,
  agentSupportsHttpMcp: boolean,
  parentSessionId?: string,
): Effect.fn.Return<McpInjection> {
  if (!agentSupportsHttpMcp) {
    return noMcp(
      launchTarget,
      `${agentLaunchTargetLabel(launchTarget)} does not support HTTP MCP servers, so it cannot use the HOA hub.`,
    );
  }
  const hub = yield* awaitHub(SETTLE_TIMEOUT);
  if (hub === undefined) {
    const availability = hubAvailability();
    const why = availability._tag === 'unavailable' ? ` (${availability.reason})` : '';
    return noMcp(launchTarget, `The HOA hub was unavailable when this session started${why}. Reopen it to connect.`);
  }
  const token = mintToken();
  const preapproval = mcpToolPreapprovalMeta(launchTarget, MCP_SERVER_NAME, HUB_TOOL_NAMES);
  credentials.set(token, {
    launchTarget,
    ...(parentSessionId === undefined ? {} : { parentSessionId }),
    sessionId: undefined,
  });
  // The agent may dial the hub the moment its session starts, so the hub must already know the token.
  if (!(yield* hub.register(token))) {
    credentials.delete(token);
    // A timed-out register may still land at the hub; frames are ordered, so this revoke lands after it.
    yield* hub.revoke(token);
    return noMcp(launchTarget, 'The HOA hub did not accept this session. Reopen it to connect.');
  }
  return {
    abandon: Effect.suspend(() => {
      credentials.delete(token);
      return hub.revoke(token);
    }),
    bind: sessionId =>
      Effect.gen(function* () {
        // A load / resume re-issues the credential: the previous one for this session stops working.
        yield* revokeWhere(
          (credential, other) =>
            other !== token && credential.launchTarget === launchTarget && credential.sessionId === sessionId,
        );
        const credential = credentials.get(token);
        if (credential !== undefined) {
          credential.sessionId = sessionId;
          yield* hub.bind(token, launchTarget, sessionId, parentSessionId);
          setStatus(launchTarget, sessionId, { _tag: 'bound' });
        }
      }),
    params: {
      mcpServers: [
        {
          headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
          name: MCP_SERVER_NAME,
          type: 'http',
          url: hub.mcpUrl,
        },
      ],
      // Claude would otherwise ask the user before every hub tool call, stalling a Handoff on a permission prompt.
      ...(preapproval === undefined ? {} : { _meta: preapproval }),
    },
  };
});

/** Drop all credentials and statuses without telling the hub (tests only: module state outlives a test's scope). */
export const forgetAllMcpTokens = (): void => {
  credentials.clear();
  publishStatuses(new Map());
};

export type HubToolCall = { readonly args: unknown; readonly token: string; readonly tool: string };

const isHubToolName = (tool: string): tool is HubToolName => (HUB_TOOL_NAMES as readonly string[]).includes(tool);

/** Run one tool call routed from the hub, as the session that owns `call.token`. */
export const handleHubToolCall = (
  call: HubToolCall,
  ctx: HubToolContext,
): Effect.Effect<HubToolResult, never, HostServices> => {
  const credential = credentials.get(call.token);
  if (credential?.sessionId === undefined) {
    return Effect.succeed(toolError('This session is not connected to the Harness.'));
  }
  if (!isHubToolName(call.tool)) {
    return Effect.succeed(toolError(`Unknown tool: ${call.tool}`));
  }
  return HUB_TOOL_HANDLERS[call.tool](
    call.args,
    {
      launchTarget: credential.launchTarget,
      sessionId: credential.sessionId,
    },
    ctx,
  );
};
