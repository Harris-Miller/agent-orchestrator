/**
 * Composer model: the draft for the Selected target and the one Composer action it offers (glossary: Composer,
 * Composer action, Draft during turn).
 *
 * Interface:
 * - Read model: {@link composerAtom}.
 * - AtomFns ({@link createComposerAtoms}): `editComposerAtomFn` edits the Selected target's draft;
 *   `submitComposerAtomFn` performs the current Composer action when it is Send or Steering, otherwise does nothing.
 *   Prompt turn cancel stays `cancelPromptAtomFn`.
 *
 * Invariants:
 * - Per-Session drafts are private here (single writer); the Virtual draft lives on the Virtual session blob and is
 *   written only through `editVirtual`.
 * - Submit reads the Composer action and takes the draft from the registry in one synchronous step, so the action
 *   performed is the one decided for that draft.
 * - Submit is concurrent: a later submit never interrupts an earlier in-flight Send or Steering.
 * - A failed Steering puts the message back into the steered Session's draft, ahead of anything typed since.
 * - Every write goes through the registry (a re-invoked AtomFn's `FnContext.set` is a no-op).
 */
import { Cause, Effect } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import { hasSteeringSupport } from '../host/acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { composerGates } from '../host/composerAction.ts';
import type { ComposerGates } from '../host/composerAction.ts';
import type { ComposerImageAttachment } from '../host/composerImageAttachment.ts';
import type { AvailableCommand } from '../host/sessionUpdateReducer.ts';

import {
  backendHarnessSnapshotAtom,
  selectedAtom,
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionLaunchTargetAtom,
} from './backendState.atoms.ts';
import { sendChatItemEffect, steerChatItemEffect } from './chat.atoms.ts';
import { handoffInProgressAtom } from './handoff.atoms.ts';
import {
  editVirtual,
  sendVirtual,
  virtualMaterializingAtom,
  virtualSendPendingAtom,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;

const sessionDraftAtom = Atom.family((_sessionId: string) => Atom.make('').pipe(Atom.keepAlive));

const sessionAttachmentsAtom = Atom.family((_sessionId: string) =>
  Atom.make<readonly ComposerImageAttachment[]>([]).pipe(Atom.keepAlive),
);

export type ComposerTarget =
  | { readonly _tag: 'Session'; readonly launchTarget: AgentLaunchTarget | undefined; readonly sessionId: string }
  | { readonly _tag: 'Virtual'; readonly launchTarget: AgentLaunchTarget | undefined };

export type Composer = ComposerGates & {
  readonly attachments: readonly ComposerImageAttachment[];
  /** From the Selected Session, or the Bound Virtual session. */
  readonly availableCommands: readonly AvailableCommand[];
  readonly draft: string;
  /** `undefined` when nothing is Selected. */
  readonly target: ComposerTarget | undefined;
};

export type ComposerEdit = {
  readonly attachments?: readonly ComposerImageAttachment[];
  readonly draft?: string;
};

type Draft = { readonly attachments: readonly ComposerImageAttachment[]; readonly draft: string };

const hasContent = ({ attachments, draft }: Draft): boolean => draft.trim().length > 0 || attachments.length > 0;

const NO_COMMANDS: readonly AvailableCommand[] = [];

/** The Composer for the Selected target. */
export const composerAtom = Atom.make((get): Composer => {
  const selected = get(selectedAtom);
  const handoffInProgress = get(handoffInProgressAtom);

  if (selected?._tag === 'Virtual') {
    const virtual = get(virtualSessionAtom);
    const launchTarget = virtual?.launchTarget;
    const draft: Draft = { attachments: virtual?.attachments ?? [], draft: virtual?.draft ?? '' };
    const harness = launchTarget === undefined ? undefined : get(backendHarnessSnapshotAtom(launchTarget));
    const bound =
      harness !== undefined && virtual?.sessionId !== undefined && virtual.sessionId in harness.sessions
        ? harness.sessions[virtual.sessionId]
        : undefined;
    return {
      ...draft,
      ...composerGates({
        _tag: 'Virtual',
        cwd: virtual?.cwd,
        handoffInProgress,
        hasContent: hasContent(draft),
        launchTarget,
        materializing: get(virtualMaterializingAtom),
        providerPhase: harness?.phase,
        sendPending: get(virtualSendPendingAtom),
      }),
      availableCommands: bound?.availableCommands ?? NO_COMMANDS,
      target: { _tag: 'Virtual', launchTarget },
    };
  }

  const sessionId = selected?._tag === 'Session' ? selected.sessionId : undefined;
  const draft: Draft =
    sessionId === undefined
      ? { attachments: [], draft: '' }
      : { attachments: get(sessionAttachmentsAtom(sessionId)), draft: get(sessionDraftAtom(sessionId)) };
  const session = get(selectedSessionAtom);
  return {
    ...draft,
    ...composerGates({
      _tag: 'Session',
      handoffInProgress,
      hasContent: hasContent(draft),
      session,
      steeringSupported: hasSteeringSupport(get(selectedBackendHarnessSnapshotAtom)?.initializeResult),
    }),
    availableCommands: session?.availableCommands ?? NO_COMMANDS,
    target:
      sessionId === undefined
        ? undefined
        : { _tag: 'Session', launchTarget: get(selectedSessionLaunchTargetAtom), sessionId },
  };
}).pipe(Atom.keepAlive);

const setSessionDraft = (registry: Registry, sessionId: string, edit: ComposerEdit): void => {
  if (edit.draft !== undefined) {
    registry.set(sessionDraftAtom(sessionId), edit.draft);
  }
  if (edit.attachments !== undefined) {
    registry.set(sessionAttachmentsAtom(sessionId), edit.attachments);
  }
};

/** Read and clear a Session's draft in one synchronous step. */
const takeSessionDraft = (registry: Registry, sessionId: string): Draft => {
  const taken: Draft = {
    attachments: registry.get(sessionAttachmentsAtom(sessionId)),
    draft: registry.get(sessionDraftAtom(sessionId)),
  };
  setSessionDraft(registry, sessionId, { attachments: [], draft: '' });
  return taken;
};

/** Put a failed Steering message back into its Session's draft, ahead of anything typed since. */
const restoreSessionDraft = (registry: Registry, sessionId: string, taken: Draft): void => {
  const current = registry.get(sessionDraftAtom(sessionId));
  setSessionDraft(registry, sessionId, {
    attachments: [...taken.attachments, ...registry.get(sessionAttachmentsAtom(sessionId))],
    draft: current.length === 0 ? taken.draft : `${taken.draft}\n${current}`,
  });
};

export const createComposerAtoms = (runtime: HostRuntimeBag) => {
  const { atomRuntime } = runtime;

  const editComposerAtomFn = atomRuntime
    .fn((edit: ComposerEdit, get: Atom.FnContext) => {
      const selected = get(selectedAtom);
      if (selected?._tag === 'Virtual') {
        return editVirtual(get.registry, edit);
      }
      if (selected?._tag === 'Session') {
        setSessionDraft(get.registry, selected.sessionId, edit);
      }
      return Effect.void;
    })
    .pipe(Atom.keepAlive);

  const submitComposerAtomFn = atomRuntime
    .fn(
      Effect.fn('submitComposerAtomFn', { root: true })(function* (_arg: undefined, get: Atom.FnContext) {
        const { registry } = get;
        const { action, target } = registry.get(composerAtom);
        if (target?._tag === 'Virtual') {
          yield* Effect.annotateCurrentSpan('composer.action', action._tag);
          if (action._tag === 'Send') {
            // The draft stays on the Virtual session until Materialize succeeds (ui ADR-0007).
            yield* sendVirtual(registry, materialized =>
              sendChatItemEffect({ ...materialized, text: materialized.draft }, get),
            );
          }
          return;
        }
        if (target?.launchTarget === undefined || (action._tag !== 'Send' && action._tag !== 'Steer')) {
          yield* Effect.annotateCurrentSpan('composer.action', action._tag);
          return;
        }
        const { launchTarget, sessionId } = target;
        const taken = takeSessionDraft(registry, sessionId);
        yield* Effect.annotateCurrentSpan('composer.action', action._tag);
        const arg = { attachments: taken.attachments, launchTarget, sessionId, text: taken.draft };
        if (action._tag === 'Send') {
          // The draft is not restored. Send's gate reads the state this action was decided from, so it is not refused
          // here; once the user message is appended, a failed prompt leaves the message in the transcript.
          yield* sendChatItemEffect(arg, get);
          return;
        }
        yield* steerChatItemEffect(arg, get).pipe(
          Effect.onError(cause =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.sync(() => {
                  restoreSessionDraft(registry, sessionId, taken);
                }),
          ),
        );
      }),
      { concurrent: true },
    )
    .pipe(Atom.keepAlive);

  return { editComposerAtomFn, submitComposerAtomFn };
};
