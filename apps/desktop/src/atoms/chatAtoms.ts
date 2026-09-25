/** Chat prompt / permission / elicitation / config Atom fns. */
import type { CreateElicitationResponseBody } from '@libs/effect-acp';
import { Effect } from 'effect';
import { Atom } from 'effect/unstable/reactivity';

import {
  applySetConfigOptionResult,
  normalizeConfigOptions,
  patchConfigOptionValue,
  selectionFromSessionConfiguration,
} from '../acp/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../acp/agentLaunchTarget.ts';
import { withUserChatMessage } from '../acp/applySessionUpdate.ts';
import { getPromptSpan } from '../acp/promptSpanRegistry.ts';
import { cancelSession, setConfigOption } from '../acp/sessionRpc.ts';
import { markNonFinishedToolCallsCancelled } from '../acp/sessionUpdateReducer.ts';

import { acpRuntime } from './acpRuntime.ts';
import { backendHarnessStateAtom, selectedSessionIdAtom } from './backendStateAtoms.ts';
import {
  patchSession,
  sendPromptSoftCancel,
  syncProviderConfigFromSessionConfiguration,
  withSessionClientRequest,
} from './sessionPatch.ts';

export const draftAtom = Atom.family((_sessionId: string) => Atom.make('').pipe(Atom.keepAlive));

export const sendChatItemAtomFn = acpRuntime
  .fn(
    Effect.fn('sendChatItemAtomFn', { root: true })(function* (
      arg: { launchTarget: AgentLaunchTarget; text: string },
      get: Atom.FnContext,
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

      get.set(backendHarnessStateAtom(arg.launchTarget), {
        ...snapshot,
        sessions: patchSession(snapshot.sessions, session.sessionId, current => withUserChatMessage(current, trimmed)),
      });

      yield* withSessionClientRequest(
        arg.launchTarget,
        get,
        session.sessionId,
        'prompt',
        sendPromptSoftCancel(arg.launchTarget, get, session.sessionId, trimmed),
      );
    }),
  )
  .pipe(Atom.keepAlive);

export const cancelPromptAtomFn = acpRuntime
  .fn(
    Effect.fnUntraced(
      function* (arg: { launchTarget: AgentLaunchTarget; sessionId: string }, get: Atom.FnContext) {
        yield* Effect.annotateCurrentSpan({
          'acp.agent': arg.launchTarget,
          'acp.sessionId': arg.sessionId,
        });

        const snapshot = get(backendHarnessStateAtom(arg.launchTarget));
        const session = snapshot.sessions[arg.sessionId];
        if (session.pendingClientRequest !== 'prompt') {
          return;
        }

        const { pendingPermission } = session;
        const { pendingElicitation } = session;

        if (pendingPermission !== undefined) {
          pendingPermission.resolve({ outcome: { outcome: 'cancelled' } });
        }
        if (pendingElicitation !== undefined) {
          pendingElicitation.resolve({ action: 'cancel' });
        }

        get.set(backendHarnessStateAtom(arg.launchTarget), {
          ...snapshot,
          sessions: patchSession(snapshot.sessions, arg.sessionId, current => ({
            ...current,
            pendingElicitation: undefined,
            pendingPermission: undefined,
            promptCancelRequested: true,
            transcript: markNonFinishedToolCallsCancelled(current.transcript),
          })),
        });

        yield* cancelSession(arg.launchTarget, arg.sessionId);
      },
      Effect.withSpan('cancelPromptAtomFn', arg => {
        const parent = getPromptSpan(arg.launchTarget, arg.sessionId);
        return parent !== undefined ? { parent } : { root: true };
      }),
    ),
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
        get: Atom.FnContext,
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
        get: Atom.FnContext,
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
      get: Atom.FnContext,
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

      yield* withSessionClientRequest(arg.launchTarget, get, session.sessionId, 'config', rpc).pipe(
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
