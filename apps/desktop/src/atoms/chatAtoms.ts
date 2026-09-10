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
import type { AgentLaunchTarget } from '../acp/agentLaunchTarget.ts';
import { getPromptSpan } from '../acp/promptSpanRegistry.ts';
import { defaultsFromSelectable, saveHarnessDefaults } from '../acp/providerConfigStorage.ts';
import { sendPrompt, setConfigOption } from '../acp/sessionRpc.ts';
import { appendUserChatMessage } from '../acp/sessionUpdateReducer.ts';

import { acpRuntime } from './acpRuntime.ts';
import type { AcpAtomGet } from './acpRuntime.ts';
import { backendHarnessStateAtom, providerConfigAtom, selectedSessionIdAtom } from './backendStateAtoms.ts';
import { patchSession, syncProviderConfigFromSessionConfiguration, withSessionClientRequest } from './sessionPatch.ts';

export const draftAtom = Atom.family((_sessionId: string) => Atom.make('').pipe(Atom.keepAlive));

export const sendChatItemAtomFn = acpRuntime
  .fn(
    Effect.fn('sendChatItemAtomFn', { root: true })(function* (
      arg: { launchTarget: AgentLaunchTarget; text: string },
      get: AcpAtomGet,
    ) {
      const trimmed = arg.text.trim();
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];

      if (trimmed.length === 0 || session?.status !== 'active') {
        return;
      }

      yield* Effect.annotateCurrentSpan({
        'acp.agent': arg.launchTarget,
        'acp.sessionId': session.sessionId,
      });

      const transcript = appendUserChatMessage(session.transcript, trimmed);
      get.set(backendHarnessStateAtom(arg.launchTarget), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
          ...current,
          transcript,
        })),
      });

      yield* withSessionClientRequest(
        arg.launchTarget,
        get,
        session.sessionId,
        sendPrompt(arg.launchTarget, session.sessionId, trimmed),
      );
    }),
  )
  .pipe(Atom.keepAlive);

export const respondElicitationAtomFn = acpRuntime
  .fn(
    Effect.fnUntraced(
      function* (
        arg: {
          launchTarget: AgentLaunchTarget;
          response: CreateElicitationResponseBody;
          sessionId: string;
        },
        get: AcpAtomGet,
      ) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.launchTarget,
          'acp.sessionId': arg.sessionId,
        });
        const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
        const pending = snapshot.sessions[arg.sessionId].pendingElicitation;
        if (pending === undefined) {
          return;
        }
        pending.resolve(arg.response);
        get.set(backendHarnessStateAtom(arg.launchTarget), {
          ...snapshot,
          sessions: patchSession(snapshot.sessions, arg.sessionId, current => ({
            ...current,
            pendingElicitation: undefined,
          })),
        });
      },
      Effect.withSpan('respondElicitationAtomFn', arg => {
        const parent = getPromptSpan(arg.launchTarget, arg.sessionId);
        return parent !== undefined ? { parent } : { root: true };
      }),
    ),
  )
  .pipe(Atom.keepAlive);

export const respondPermissionAtomFn = acpRuntime
  .fn(
    Effect.fnUntraced(
      function* (
        arg: {
          launchTarget: AgentLaunchTarget;
          optionId: string;
          sessionId: string;
        },
        get: AcpAtomGet,
      ) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.launchTarget,
          'acp.sessionId': arg.sessionId,
        });
        const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
        const pending = snapshot.sessions[arg.sessionId].pendingPermission;
        if (pending === undefined) {
          return;
        }
        pending.resolve({ outcome: { optionId: arg.optionId, outcome: 'selected' } });
        get.set(backendHarnessStateAtom(arg.launchTarget), {
          ...snapshot,
          sessions: patchSession(snapshot.sessions, arg.sessionId, current => ({
            ...current,
            pendingPermission: undefined,
          })),
        });
      },
      Effect.withSpan('respondPermissionAtomFn', arg => {
        const parent = getPromptSpan(arg.launchTarget, arg.sessionId);
        return parent !== undefined ? { parent } : { root: true };
      }),
    ),
  )
  .pipe(Atom.keepAlive);

export const setConfigOptionAtomFn = acpRuntime
  .fn(
    Effect.fn('setConfigOptionAtomFn', { root: true })(function* (
      arg: { configId: string; launchTarget: AgentLaunchTarget; value: string },
      get: AcpAtomGet,
    ) {
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];
      const currentValue = normalizeConfigOptions(session?.sessionConfiguration).find(
        option => option.id === arg.configId,
      )?.currentValue;

      if (session?.status !== 'active' || currentValue === arg.value) {
        return;
      }

      yield* Effect.annotateCurrentSpan({
        'acp.agent': arg.launchTarget,
        'acp.sessionId': session.sessionId,
      });

      const previousModeId = session.selectedModeId;
      const previousModelId = session.selectedModelId;
      const previousSessionState = session.sessionConfiguration;
      const patchedSessionState = patchConfigOptionValue(session.sessionConfiguration, arg.configId, arg.value);
      const selection = selectionFromSessionConfiguration(patchedSessionState);

      get.set(backendHarnessStateAtom(arg.launchTarget), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => ({
          ...current,
          selectedModeId: selection.selectedModeId ?? current.selectedModeId,
          selectedModelId: selection.selectedModelId ?? current.selectedModelId,
          sessionConfiguration: patchedSessionState,
        })),
      });

      const rpc = Effect.gen(function* () {
        const result = yield* setConfigOption(arg.launchTarget, session.sessionId, arg.configId, arg.value);
        const currentSnapshot = get(backendHarnessStateAtom(arg.launchTarget));
        const applied = applySetConfigOptionResult(
          currentSnapshot.sessions[session.sessionId].sessionConfiguration,
          result,
        );
        syncProviderConfigFromSessionConfiguration(get, arg.launchTarget, applied.sessionConfiguration);
        get.set(backendHarnessStateAtom(arg.launchTarget), {
          ...currentSnapshot,
          sessions: patchSession(currentSnapshot.sessions, session.sessionId, current => ({
            ...current,
            selectedModeId: applied.selectedModeId ?? current.selectedModeId,
            selectedModelId: applied.selectedModelId ?? current.selectedModelId,
            sessionConfiguration: applied.sessionConfiguration,
          })),
        });
      });

      yield* withSessionClientRequest(arg.launchTarget, get, session.sessionId, rpc).pipe(
        Effect.tapError(error =>
          Effect.gen(function* () {
            yield* Effect.logError('setConfigOptionAtomFn failed; rolling back', arg.launchTarget, arg.configId, error);
            get.set(backendHarnessStateAtom(arg.launchTarget), {
              ...get(backendHarnessStateAtom(arg.launchTarget)),
              sessions: patchSession(
                get(backendHarnessStateAtom(arg.launchTarget)).sessions,
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

export const saveHarnessDefaultsAtomFn = acpRuntime
  .fn((arg: { launchTarget: AgentLaunchTarget }, get) =>
    Effect.sync(() => {
      const sessionId = get(selectedSessionIdAtom);
      const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
      const session = sessionId === undefined ? undefined : snapshot.sessions[sessionId];
      if (session?.status !== 'active') {
        return;
      }

      const values = defaultsFromSelectable(normalizeSelectableConfigOptions(session.sessionConfiguration));
      if (Object.keys(values).length === 0) {
        return;
      }

      const next = saveHarnessDefaults(arg.launchTarget, values);
      get.set(providerConfigAtom(arg.launchTarget), next);
    }),
  )
  .pipe(Atom.keepAlive);
