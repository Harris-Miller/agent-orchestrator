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
import type { AgentLaunchTarget } from '../acp/agentHarness.ts';
import { appendBackendUserChatItem, getAgentHandle, sendPrompt, setConfigOption } from '../acp/agentHarness.ts';
import { getPromptSpan } from '../acp/promptSpanRegistry.ts';
import { defaultsFromSelectable, saveHarnessDefaults } from '../acp/providerConfigStorage.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import { backendHarnessStateAtom, providerConfigAtom, selectedSessionIdAtom } from './backendStateAtoms.ts';
import { patchSession, syncProviderConfigFromSessionConfiguration, withSessionClientRequest } from './sessionPatch.ts';

export const draftAtom = Atom.family((_sessionId: string) => Atom.make('').pipe(Atom.keepAlive));

export const sendChatItemFn = acpRuntime
  .fn(
    Effect.fn('sendChatItemFn', { root: true })(function* (
      arg: { backend: AgentLaunchTarget; text: string },
      get: AcpAtomGet,
    ) {
      const trimmed = arg.text.trim();
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendHarnessStateAtom(arg.backend));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];

      if (trimmed.length === 0 || session?.status !== 'active') {
        return;
      }

      yield* Effect.annotateCurrentSpan({
        'acp.agent': arg.backend,
        'acp.sessionId': session.sessionId,
      });

      const chatItems = appendBackendUserChatItem(arg.backend, session.sessionId, trimmed);
      get.set(backendHarnessStateAtom(arg.backend), {
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
          backend: AgentLaunchTarget;
          response: CreateElicitationResponseBody;
          sessionId: string;
        },
        get: AcpAtomGet,
      ) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
        });
        const snapshot = get(backendHarnessStateAtom(arg.backend));
        const pending = snapshot.sessions[arg.sessionId].pendingElicitation;
        if (pending === undefined) {
          return;
        }
        pending.resolve(arg.response);
        get.set(backendHarnessStateAtom(arg.backend), {
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
          backend: AgentLaunchTarget;
          optionId: string;
          sessionId: string;
        },
        get: AcpAtomGet,
      ) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.backend,
          'acp.sessionId': arg.sessionId,
        });
        const snapshot = get(backendHarnessStateAtom(arg.backend));
        const pending = snapshot.sessions[arg.sessionId].pendingPermission;
        if (pending === undefined) {
          return;
        }
        pending.resolve({ outcome: { optionId: arg.optionId, outcome: 'selected' } });
        get.set(backendHarnessStateAtom(arg.backend), {
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
      arg: { backend: AgentLaunchTarget; configId: string; value: string },
      get: AcpAtomGet,
    ) {
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendHarnessStateAtom(arg.backend));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];
      const currentValue = normalizeConfigOptions(session?.sessionConfiguration).find(
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
      const previousSessionState = session.sessionConfiguration;
      const patchedSessionState = patchConfigOptionValue(session.sessionConfiguration, arg.configId, arg.value);
      const selection = selectionFromSessionConfiguration(patchedSessionState);

      get.set(backendHarnessStateAtom(arg.backend), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
          ...current,
          selectedModeId: selection.selectedModeId ?? current.selectedModeId,
          selectedModelId: selection.selectedModelId ?? current.selectedModelId,
          sessionConfiguration: patchedSessionState,
        })),
      });

      const rpc = Effect.gen(function* () {
        const agent = getAgentHandle(arg.backend);
        if (agent === undefined) {
          return;
        }

        const result = yield* setConfigOption(agent, session.sessionId, arg.configId, arg.value);
        const currentSnapshot = get(backendHarnessStateAtom(arg.backend));
        const applied = applySetConfigOptionResult(
          currentSnapshot.sessions[session.sessionId].sessionConfiguration,
          result,
        );
        syncProviderConfigFromSessionConfiguration(get, arg.backend, applied.sessionConfiguration);
        get.set(backendHarnessStateAtom(arg.backend), {
          ...currentSnapshot,
          sessions: patchSession(currentSnapshot.sessions, session.sessionId, current => ({
            ...current,
            selectedModeId: applied.selectedModeId ?? current.selectedModeId,
            selectedModelId: applied.selectedModelId ?? current.selectedModelId,
            sessionConfiguration: applied.sessionConfiguration,
          })),
        });
      });

      yield* withSessionClientRequest(arg.backend, get, session.sessionId, rpc).pipe(
        Effect.tapError(error =>
          Effect.gen(function* () {
            yield* Effect.logError('setConfigOptionFn failed; rolling back', arg.backend, arg.configId, error);
            get.set(backendHarnessStateAtom(arg.backend), {
              ...get(backendHarnessStateAtom(arg.backend)),
              sessions: patchSession(
                get(backendHarnessStateAtom(arg.backend)).sessions,
                session.sessionId,
                current => ({
                  ...current,
                  selectedModeId: previousModeId,
                  selectedModelId: previousModelId,
                  sessionConfiguration: previousSessionState,
                }),
              ),
            });
          }),
        ),
      );
    }),
  )
  .pipe(Atom.keepAlive);

export const saveHarnessDefaultsFn = acpRuntime
  .fn((arg: { backend: AgentLaunchTarget }, get) =>
    Effect.sync(() => {
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendHarnessStateAtom(arg.backend));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];
      if (session?.status !== 'active') {
        return;
      }

      const values = defaultsFromSelectable(normalizeSelectableConfigOptions(session.sessionConfiguration));
      if (Object.keys(values).length === 0) {
        return;
      }

      const next = saveHarnessDefaults(arg.backend, values);
      get.set(providerConfigAtom(arg.backend), next);
    }),
  )
  .pipe(Atom.keepAlive);
