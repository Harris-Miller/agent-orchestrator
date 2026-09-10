/** Chat prompt / permission / elicitation / config Atom fns. */
import type { CreateElicitationResponseBody } from '@libs/effect-acp';
import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import {
  applySetConfigOptionResult,
  normalizeConfigOptions,
  normalizeSelectableConfigOptions,
  patchConfigOptionValue,
  selectionFromSessionConfiguration,
} from '../acp/acpSessionBootstrap.ts';
import type { AcpAgentBackend } from '../acp/agentHarness.ts';
import { appendBackendUserChatItem, getAgentHandle, sendPrompt, setConfigOption } from '../acp/agentHarness.ts';
import { getPromptSpan } from '../acp/promptSpanRegistry.ts';
import { defaultsFromSelectable, saveHarnessDefaults } from '../acp/providerConfigStorage.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import { backendStateAtom, providerConfigAtom, selectedSessionIdAtom } from './backendStateAtoms.ts';
import { patchSession, syncProviderConfigFromSessionConfiguration, withSessionClientRequest } from './sessionPatch.ts';

export const sendChatItemFn = acpRuntime
  .fn(
    Effect.fn('sendChatItemFn', { root: true })(function* (
      arg: { backend: AcpAgentBackend; text: string },
      get: AcpAtomGet,
    ) {
      const trimmed = arg.text.trim();
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendStateAtom(arg.backend));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];

      if (trimmed.length === 0 || session?.status !== 'active') {
        return;
      }

      yield* Effect.annotateCurrentSpan({
        'acp.agent': arg.backend,
        'acp.sessionId': session.sessionId,
      });

      const chatItems = appendBackendUserChatItem(arg.backend, session.sessionId, trimmed);
      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
          ...current,
          chatItems,
        })),
      });

      yield* withSessionClientRequest(
        arg.backend,
        get,
        session.sessionId,
        Effect.gen(function* () {
          const agent = getAgentHandle(arg.backend);
          if (agent === undefined) {
            return;
          }
          yield* sendPrompt(arg.backend, agent, session.sessionId, trimmed);
        }),
      );
    }),
  )
  .pipe(Atom.keepAlive);

export const respondElicitationFn = acpRuntime
  .fn(
    Effect.fnUntraced(
      function* (
        arg: {
          backend: AcpAgentBackend;
          response: CreateElicitationResponseBody;
          sessionId: string;
        },
        get: AcpAtomGet,
      ) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
        });
        const snapshot = get(backendStateAtom(arg.backend));
        const pending = snapshot.sessions[arg.sessionId].pendingElicitation;
        if (pending === undefined) {
          return;
        }
        pending.resolve(arg.response);
        get.set(backendStateAtom(arg.backend), {
          ...snapshot,
          sessions: patchSession(snapshot.sessions, arg.sessionId, current => ({
            ...current,
            pendingElicitation: undefined,
          })),
        });
      },
      Effect.withSpan('respondElicitationFn', arg => {
        const parent = getPromptSpan(arg.backend, arg.sessionId);
        return parent !== undefined ? { parent } : { root: true };
      }),
    ),
  )
  .pipe(Atom.keepAlive);

export const respondPermissionFn = acpRuntime
  .fn(
    Effect.fnUntraced(
      function* (
        arg: {
          backend: AcpAgentBackend;
          optionId: string;
          sessionId: string;
        },
        get: AcpAtomGet,
      ) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
        });
        const snapshot = get(backendStateAtom(arg.backend));
        const pending = snapshot.sessions[arg.sessionId].pendingPermission;
        if (pending === undefined) {
          return;
        }
        pending.resolve({ outcome: { optionId: arg.optionId, outcome: 'selected' } });
        get.set(backendStateAtom(arg.backend), {
          ...snapshot,
          sessions: patchSession(snapshot.sessions, arg.sessionId, current => ({
            ...current,
            pendingPermission: undefined,
          })),
        });
      },
      Effect.withSpan('respondPermissionFn', arg => {
        const parent = getPromptSpan(arg.backend, arg.sessionId);
        return parent !== undefined ? { parent } : { root: true };
      }),
    ),
  )
  .pipe(Atom.keepAlive);

export const setConfigOptionFn = acpRuntime
  .fn(
    Effect.fn('setConfigOptionFn', { root: true })(function* (
      arg: { backend: AcpAgentBackend; configId: string; value: string },
      get: AcpAtomGet,
    ) {
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendStateAtom(arg.backend));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];
      const currentValue = normalizeConfigOptions(session?.sessionState).find(
        option => option.id === arg.configId,
      )?.currentValue;

      if (session?.status !== 'active' || currentValue === arg.value) {
        return;
      }

      yield* Effect.annotateCurrentSpan({
        'acp.agent': arg.backend,
        'acp.sessionId': session.sessionId,
      });

      const previousModeId = session.selectedModeId;
      const previousModelId = session.selectedModelId;
      const previousSessionState = session.sessionState;
      const patchedSessionState = patchConfigOptionValue(session.sessionState, arg.configId, arg.value);
      const selection = selectionFromSessionConfiguration(patchedSessionState);

      get.set(backendStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
          ...current,
          selectedModeId: selection.selectedModeId ?? current.selectedModeId,
          selectedModelId: selection.selectedModelId ?? current.selectedModelId,
          sessionState: patchedSessionState,
        })),
      });

      const rpc = Effect.gen(function* () {
        const agent = getAgentHandle(arg.backend);
        if (agent === undefined) {
          return;
        }

        const result = yield* setConfigOption(agent, session.sessionId, arg.configId, arg.value);
        const currentSnapshot = get(backendStateAtom(arg.backend));
        const applied = applySetConfigOptionResult(currentSnapshot.sessions[session.sessionId].sessionState, result);
        syncProviderConfigFromSessionConfiguration(get, arg.backend, applied.sessionState);
        get.set(backendStateAtom(arg.backend), {
          ...currentSnapshot,
          sessions: patchSession(currentSnapshot.sessions, session.sessionId, current => ({
            ...current,
            selectedModeId: applied.selectedModeId ?? current.selectedModeId,
            selectedModelId: applied.selectedModelId ?? current.selectedModelId,
            sessionState: applied.sessionState,
          })),
        });
      });

      yield* withSessionClientRequest(arg.backend, get, session.sessionId, rpc).pipe(
        Effect.tapError(error =>
          Effect.gen(function* () {
            yield* Effect.logError('setConfigOptionFn failed; rolling back', arg.backend, arg.configId, error);
            get.set(backendStateAtom(arg.backend), {
              ...get(backendStateAtom(arg.backend)),
              sessions: patchSession(get(backendStateAtom(arg.backend)).sessions, session.sessionId, current => ({
                ...current,
                selectedModeId: previousModeId,
                selectedModelId: previousModelId,
                sessionState: previousSessionState,
              })),
            });
          }),
        ),
      );
    }),
  )
  .pipe(Atom.keepAlive);

export const saveHarnessDefaultsFn = acpRuntime
  .fn((arg: { backend: AcpAgentBackend }, get) =>
    Effect.sync(() => {
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendStateAtom(arg.backend));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];
      if (session?.status !== 'active') {
        return;
      }

      const values = defaultsFromSelectable(normalizeSelectableConfigOptions(session.sessionState));
      if (Object.keys(values).length === 0) {
        return;
      }

      const next = saveHarnessDefaults(arg.backend, values);
      get.set(providerConfigAtom(arg.backend), next);
    }),
  )
  .pipe(Atom.keepAlive);
