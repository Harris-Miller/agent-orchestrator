/** Cross-backend session handoff Atom fns. */
import { Effect, Exit, Schema } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import {
  applySetConfigOptionResult,
  backendLabel,
  normalizeSessionInfoFromNew,
  patchConfigOptionValue,
  upsertRosterEntry,
} from '../prototype/agentChat/acpSessionBootstrap.ts';
import type { AcpAgentBackend } from '../prototype/agentChat/agentHarness.ts';
import {
  appendBackendUserChatItem,
  createSession,
  getAgentHandle,
  sendPrompt,
  setConfigOption,
} from '../prototype/agentChat/agentHarness.ts';
import {
  buildTargetHandoffSeedPrompt,
  extractHandoffDocument,
  SOURCE_HANDOFF_PROMPT,
} from '../prototype/agentChat/handoffDocument.ts';
import { harnessDefaultDiffs } from '../prototype/agentChat/providerConfigStorage.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import {
  backendStateAtom,
  handoffInProgressAtom,
  providerConfigAtom,
  selectSession,
  unifiedSessionRosterAtom,
} from './backendStateAtoms.ts';
import {
  applySessionActivationResult,
  patchSession,
  syncProviderConfigFromSessionConfiguration,
  upsertSession,
  withSessionClientRequest,
} from './sessionPatch.ts';

export class HandoffError extends Schema.TaggedError<HandoffError>()('HandoffError', {
  message: Schema.String,
}) {}

const promptPinnedSession = Effect.fn('promptPinnedSession')(
  function* (backend: AcpAgentBackend, get: AcpAtomGet, sessionId: string, text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return yield* new HandoffError({ message: 'Handoff prompt text is empty' });
    }

    const agent = getAgentHandle(backend);
    if (agent === undefined) {
      return yield* new HandoffError({ message: `Agent handle missing for ${backendLabel(backend)}` });
    }

    const snapshot = get(backendStateAtom(backend));
    const session = snapshot.sessions[sessionId];
    if (session.status !== 'active') {
      return yield* new HandoffError({ message: `Session ${sessionId} is not active` });
    }
    if (
      session.pendingClientRequest === true ||
      session.pendingElicitation !== undefined ||
      session.pendingPermission !== undefined
    ) {
      return yield* new HandoffError({ message: `Session ${sessionId} cannot accept a prompt right now` });
    }

    yield* Effect.logInfo('Pinned session prompt', backend, sessionId, { chars: trimmed.length });
    const chatItems = appendBackendUserChatItem(backend, sessionId, trimmed);
    get.set(backendStateAtom(backend), {
      ...snapshot,
      sessions: patchSession(snapshot.sessions, sessionId, current => ({
        ...current,
        chatItems,
      })),
    });

    yield* withSessionClientRequest(backend, get, sessionId, sendPrompt(backend, agent, sessionId, trimmed));
  },
  (effect, backend, _get, sessionId) =>
    effect.pipe(Effect.tapError(error => Effect.logError('promptPinnedSession failed', backend, sessionId, error))),
);

export const handoffSessionFn = acpRuntime
  .fn(
    Effect.fn('handoffSessionFn', { root: true })(
      function* (
        arg: {
          configValues: Readonly<Record<string, string>>;
          sourceBackend: AcpAgentBackend;
          sourceSessionId: string;
          targetBackend: AcpAgentBackend;
        },
        get: AcpAtomGet,
      ) {
        get.set(handoffInProgressAtom, true);
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.sourceBackend,
          'acp.sessionId': arg.sourceSessionId,
        });
        yield* Effect.logInfo('Handoff started', {
          sourceBackend: arg.sourceBackend,
          sourceSessionId: arg.sourceSessionId,
          targetBackend: arg.targetBackend,
        });
        const sourceEntry = get(unifiedSessionRosterAtom).find(
          entry => entry.backend === arg.sourceBackend && entry.sessionId === arg.sourceSessionId,
        );
        if (sourceEntry === undefined) {
          return yield* new HandoffError({ message: 'Source session cwd not found on roster' });
        }

        // Source handoff prompt is the only hard gate: failure means no target session.
        yield* promptPinnedSession(arg.sourceBackend, get, arg.sourceSessionId, SOURCE_HANDOFF_PROMPT);

        const sourceChatItems = get(backendStateAtom(arg.sourceBackend)).sessions[arg.sourceSessionId].chatItems;
        const handoffDocument = extractHandoffDocument(sourceChatItems);
        if (handoffDocument === undefined) {
          return yield* new HandoffError({ message: 'Handoff document missing from source agent response' });
        }

        // After a successful source response, target create / config / seed failures are soft.
        const targetAgent = getAgentHandle(arg.targetBackend);
        if (targetAgent === undefined) {
          yield* Effect.logWarning('Handoff soft-abort; target agent missing', arg.targetBackend);
          return;
        }

        const createExit = yield* Effect.exit(createSession(targetAgent, sourceEntry.cwd));
        if (Exit.isFailure(createExit)) {
          yield* Effect.logWarning('Handoff soft-abort; target session create failed', arg.targetBackend);
          return;
        }
        const { cwd, result } = createExit.value;
        const { sessionId: targetSessionId } = result;

        syncProviderConfigFromSessionConfiguration(get, arg.targetBackend, result);

        const rosterEntry = normalizeSessionInfoFromNew(result, cwd);
        const createdSnapshot = get(backendStateAtom(arg.targetBackend));
        get.set(backendStateAtom(arg.targetBackend), {
          ...createdSnapshot,
          sessionRoster:
            rosterEntry === undefined
              ? createdSnapshot.sessionRoster
              : upsertRosterEntry(createdSnapshot.sessionRoster, rosterEntry),
          sessions: upsertSession(createdSnapshot.sessions, applySessionActivationResult(targetSessionId, result)),
        });
        selectSession(get, arg.targetBackend, targetSessionId);

        let sessionState: unknown = result;
        const { defaults } = get(providerConfigAtom(arg.targetBackend)) ?? { defaults: {} };
        for (const diff of harnessDefaultDiffs(sessionState, defaults)) {
          const patched = patchConfigOptionValue(sessionState, diff.configId, diff.value);
          const exit = yield* Effect.exit(setConfigOption(targetAgent, targetSessionId, diff.configId, diff.value));
          if (Exit.isFailure(exit)) {
            yield* Effect.logWarning('Handoff default config apply failed', arg.targetBackend, diff.configId);
            break;
          }
          const { sessionState: nextSessionState } = applySetConfigOptionResult(patched, exit.value);
          sessionState = nextSessionState;
        }

        for (const diff of harnessDefaultDiffs(sessionState, arg.configValues)) {
          const patched = patchConfigOptionValue(sessionState, diff.configId, diff.value);
          const exit = yield* Effect.exit(setConfigOption(targetAgent, targetSessionId, diff.configId, diff.value));
          if (Exit.isFailure(exit)) {
            yield* Effect.logWarning('Handoff config value apply failed', arg.targetBackend, diff.configId);
            break;
          }
          const { sessionState: nextSessionState } = applySetConfigOptionResult(patched, exit.value);
          sessionState = nextSessionState;
        }

        syncProviderConfigFromSessionConfiguration(get, arg.targetBackend, sessionState);

        const configuredSnapshot = get(backendStateAtom(arg.targetBackend));
        get.set(backendStateAtom(arg.targetBackend), {
          ...configuredSnapshot,
          sessions: upsertSession(
            configuredSnapshot.sessions,
            applySessionActivationResult(targetSessionId, sessionState),
          ),
        });

        const seedExit = yield* Effect.exit(
          promptPinnedSession(arg.targetBackend, get, targetSessionId, buildTargetHandoffSeedPrompt(handoffDocument)),
        );
        if (Exit.isFailure(seedExit)) {
          yield* Effect.logWarning('Handoff target seed prompt failed', arg.targetBackend, targetSessionId);
        } else {
          yield* Effect.logInfo('Handoff complete', {
            sourceSessionId: arg.sourceSessionId,
            targetSessionId,
          });
        }
      },
      (effect, _arg, get: AcpAtomGet) =>
        effect.pipe(
          Effect.tapError(error => Effect.logError('Handoff failed', error)),
          Effect.ensuring(
            Effect.sync(() => {
              get.set(handoffInProgressAtom, false);
            }),
          ),
        ),
    ),
  )
  .pipe(Atom.keepAlive);
