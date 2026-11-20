/**
 * Composer model: the draft for the Selected target and the one Composer action it offers (glossary: Composer,
 * Composer action, Draft during turn).
 *
 * Interface:
 * - Read model: {@link composerAtom}.
 * - AtomFns ({@link createComposerAtoms}): `editComposerAtomFn` edits the Selected target's draft;
 *   `attachComposerImagesAtomFn` adds images that finish later (Host FileDialog or absolute image paths, see
 *   {@link ComposerImageSource}) and fails with `ImageAttachmentRejected | FileDialogFailed`;
 *   `submitComposerAtomFn` performs the current Composer action when it is Send or Steering, otherwise does nothing.
 *   While Steering is offered, its argument picks Steering or Queue (default: the `midTurnSend` User setting).
 *   `unqueueComposerAtomFn` puts the Queued message back into the draft. Prompt turn cancel stays `cancelPromptAtomFn`,
 *   which un-queues first (see {@link unqueueSessionDraft}).
 *
 * Invariants:
 * - Per-Session drafts are private here (single writer); the Virtual draft lives on the Virtual session blob and is
 *   written only through the Virtual session's draft verbs.
 * - Every Composer draft write (edit, attach, Steering or refused-Send restore) reads and writes the draft in one
 *   synchronous step through the registry.
 * - An attach lands on the Composer target Selected when it was invoked, never the one Selected when it finishes.
 *   Nothing Selected means no dialog and no change.
 * - Its images are merged into that target's attachments as they are when it finishes (anything added or removed
 *   meanwhile is kept), de-duplicated by `uri`; nothing new means no write.
 * - Caps are judged on the merged list; a rejected batch changes nothing. A Pick also checks the count against the
 *   latest list before reading any file.
 * - Attaches are concurrent: a later one never interrupts an earlier one. A caller's result reflects every attach
 *   in flight (the fn atom joins them all).
 * - A Virtual target whose blob is gone (or replaced by a newer one), or whose Lifecycle lock is held, when the
 *   attach finishes drops it.
 * - Submit reads the Composer action and takes the draft from the registry in one synchronous step, so the action
 *   performed is the one decided for that draft.
 * - Submit is concurrent: a later submit never interrupts an earlier in-flight Send or Steering.
 * - A failed Steering puts the message back into the steered Session's draft, ahead of anything typed since, unless
 *   its fallback Send had begun (the message is in the transcript then).
 * - A refused Send puts the draft back the same way (nothing was appended). A Send that started does not.
 * - Queue moves the draft into the Session's one Queued message slot (a second Queue merges into it, newline-joined).
 *   The submit that fills an empty slot waits for the turn to be over, then takes the slot and Sends it through
 *   {@link sendPromptTurn}; a refusal puts it back into the draft. An empty slot at that point (unqueued) does nothing.
 *   The slot is in memory only.
 * - Every write goes through the registry (a re-invoked AtomFn's `FnContext.set` is a no-op).
 */
import { FileDialog } from '@lib/context-services';
import { Cause, Effect, Option, Stream } from 'effect';
import { Atom, AtomRegistry } from 'effect/reactivity';

import type { HostRuntimeBag } from '../createHostRuntime.ts';
import type { AgentLaunchTarget } from '../host/agentLaunchTarget.ts';
import { composerGates } from '../host/composerAction.ts';
import type { ComposerGates } from '../host/composerAction.ts';
import {
  appendUniqueComposerAttachments,
  composerImageAttachmentFromPath,
  IMAGE_ATTACH_MAX_COUNT,
  IMAGE_DIALOG_FILTERS,
  ImageAttachmentRejected,
  imageAttachmentsRejection,
} from '../host/composerImageAttachment.ts';
import type { ComposerImageAttachment } from '../host/composerImageAttachment.ts';
import type { AvailableCommand } from '../host/sessionUpdateReducer.ts';

import {
  backendHarnessSnapshotAtom,
  selectedAtom,
  selectedBackendHarnessBackgroundActiveAtom,
  selectedBackendHarnessSteeringSupportedAtom,
  selectedSessionAtom,
  selectedSessionLaunchTargetAtom,
} from './backendState.atoms.ts';
import { handoffInProgressAtom } from './handoff.atoms.ts';
import { awaitTurnEnd, sendPromptTurn, SteerFallbackTurnFailed, steerPromptTurn } from './promptTurn.ts';
import { midTurnSendModeAtom } from './userSettings/userSettingsDocument.atoms.ts';
import type { MidTurnSend } from './userSettings/userSettingsDocument.atoms.ts';
import {
  sendVirtual,
  updateVirtualDraft,
  virtualMaterializingAtom,
  virtualSendPendingAtom,
  virtualSessionAtom,
} from './virtualSession.atoms.ts';

type Registry = AtomRegistry.AtomRegistry;

const sessionDraftAtom = Atom.family((sessionId: string) =>
  Atom.make('').pipe(Atom.withLabel(`sessionDraft:${sessionId}`), Atom.keepAlive),
);

const sessionAttachmentsAtom = Atom.family((sessionId: string) =>
  Atom.make<readonly ComposerImageAttachment[]>([]).pipe(
    Atom.withLabel(`sessionAttachments:${sessionId}`),
    Atom.keepAlive,
  ),
);

/** The Session's Queued message: sent as a new Prompt turn once the in-flight one is over. */
const sessionQueuedAtom = Atom.family((sessionId: string) =>
  Atom.make<Draft | undefined>(undefined).pipe(Atom.withLabel(`sessionQueued:${sessionId}`), Atom.keepAlive),
);

/** Whether the Session has a Queued message (read-only: the Harness must not occupy or evict the user's slot). */
export const hasQueuedMessage = (registry: AtomRegistry.AtomRegistry, sessionId: string): boolean =>
  registry.get(sessionQueuedAtom(sessionId)) !== undefined;

/** Resolves once the Session's Queued message slot is empty (its Send has begun, or it was unqueued). */
export const awaitQueuedMessageTaken = (registry: AtomRegistry.AtomRegistry, sessionId: string) =>
  AtomRegistry.toStream(registry, sessionQueuedAtom(sessionId)).pipe(
    Stream.filter(queued => queued === undefined),
    Stream.runHead,
  );

export type ComposerTarget =
  | { readonly _tag: 'Session'; readonly launchTarget: AgentLaunchTarget | undefined; readonly sessionId: string }
  | {
      readonly _tag: 'Virtual';
      /** The Virtual session blob's id; `undefined` with no blob. */
      readonly blobId: string | undefined;
      readonly launchTarget: AgentLaunchTarget | undefined;
    };

export type Composer = ComposerGates & {
  readonly attachments: readonly ComposerImageAttachment[];
  /** From the Selected Session, or the Bound Virtual session. */
  readonly availableCommands: readonly AvailableCommand[];
  readonly draft: string;
  /** What Steering, when offered, does by default (the `midTurnSend` User setting). */
  readonly midTurnSend: MidTurnSend;
  /** The Selected Session's Queued message; `undefined` with none (always for Virtual). */
  readonly queued: Draft | undefined;
  /** `undefined` when nothing is Selected. */
  readonly target: ComposerTarget | undefined;
};

export type ComposerEdit = {
  readonly attachments?: readonly ComposerImageAttachment[];
  readonly draft?: string;
};

/** Where an attachment edit's images come from. */
export type ComposerImageSource =
  /** Host FileDialog, images only, multiple. */
  | { readonly _tag: 'Pick' }
  /** Absolute image paths (an image Filesystem Mention, or image paths resolved from the draft). */
  | { readonly _tag: 'Paths'; readonly paths: readonly string[] };

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
      midTurnSend: get(midTurnSendModeAtom),
      queued: undefined,
      target: { _tag: 'Virtual', blobId: virtual?.id, launchTarget },
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
      backgroundActive: get(selectedBackendHarnessBackgroundActiveAtom),
      handoffInProgress,
      hasContent: hasContent(draft),
      session,
      steeringSupported: get(selectedBackendHarnessSteeringSupportedAtom),
    }),
    availableCommands: session?.availableCommands ?? NO_COMMANDS,
    midTurnSend: get(midTurnSendModeAtom),
    queued: sessionId === undefined ? undefined : get(sessionQueuedAtom(sessionId)),
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

/** Edit `target`'s draft computed from its latest value, in one synchronous step (`undefined` = no change). */
const updateDraft = (
  registry: Registry,
  target: ComposerTarget,
  update: (current: Draft) => ComposerEdit | undefined,
): void => {
  if (target._tag === 'Virtual') {
    updateVirtualDraft(registry, target.blobId, update);
    return;
  }
  const edit = update({
    attachments: registry.get(sessionAttachmentsAtom(target.sessionId)),
    draft: registry.get(sessionDraftAtom(target.sessionId)),
  });
  if (edit !== undefined) {
    setSessionDraft(registry, target.sessionId, edit);
  }
};

const currentAttachments = (registry: Registry, target: ComposerTarget): readonly ComposerImageAttachment[] => {
  if (target._tag === 'Session') {
    return registry.get(sessionAttachmentsAtom(target.sessionId));
  }
  const virtual = registry.get(virtualSessionAtom);
  return virtual !== null && virtual.id === target.blobId ? virtual.attachments : [];
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

/** `first` ahead of `then`: attachments concatenated, text newline-joined. */
const mergeDrafts = (first: Draft, second: Draft): Draft => ({
  attachments: [...first.attachments, ...second.attachments],
  draft:
    first.draft.length === 0 || second.draft.length === 0
      ? first.draft + second.draft
      : `${first.draft}\n${second.draft}`,
});

/** Put a failed Steering, refused Send or unqueued message back into its Session's draft, ahead of anything typed since. */
const restoreSessionDraft = (registry: Registry, sessionId: string, taken: Draft): void => {
  const merged = mergeDrafts(taken, {
    attachments: registry.get(sessionAttachmentsAtom(sessionId)),
    draft: registry.get(sessionDraftAtom(sessionId)),
  });
  setSessionDraft(registry, sessionId, merged);
};

/** Add `taken` to the Session's Queued message; `'Started'` when the slot was empty (the caller then owns sending it). */
const queueSessionDraft = (registry: Registry, sessionId: string, taken: Draft): 'Merged' | 'Started' => {
  const queued = registry.get(sessionQueuedAtom(sessionId));
  registry.set(sessionQueuedAtom(sessionId), queued === undefined ? taken : mergeDrafts(queued, taken));
  return queued === undefined ? 'Started' : 'Merged';
};

/** Read and clear the Session's Queued message in one synchronous step. */
const takeQueued = (registry: Registry, sessionId: string): Draft | undefined => {
  const queued = registry.get(sessionQueuedAtom(sessionId));
  if (queued !== undefined) {
    registry.set(sessionQueuedAtom(sessionId), undefined);
  }
  return queued;
};

/** Put the Session's Queued message (if any) back into its draft. Prompt turn cancel and Edit both go through this. */
export const unqueueSessionDraft = (registry: Registry, sessionId: string): void => {
  const queued = takeQueued(registry, sessionId);
  if (queued !== undefined) {
    restoreSessionDraft(registry, sessionId, queued);
  }
};

/** Wait for the turn to be over, then Send the Queued message (if it is still queued). */
const sendQueued = Effect.fnUntraced(function* (
  registry: Registry,
  launchTarget: AgentLaunchTarget,
  sessionId: string,
) {
  yield* awaitTurnEnd(registry, launchTarget, sessionId);
  const queued = takeQueued(registry, sessionId);
  if (queued === undefined) {
    return;
  }
  yield* sendPromptTurn(registry, {
    attachments: queued.attachments,
    launchTarget,
    sessionId,
    text: queued.draft,
  }).pipe(
    Effect.tapErrorTag('ComposerActionUnavailable', () =>
      Effect.sync(() => {
        restoreSessionDraft(registry, sessionId, queued);
      }),
    ),
  );
});

export const createComposerAtoms = (runtime: HostRuntimeBag) => {
  const { atomRuntime } = runtime;

  const editComposerAtomFn = atomRuntime
    .fn((edit: ComposerEdit, get: Atom.FnContext) =>
      Effect.sync(() => {
        const { target } = get.registry.get(composerAtom);
        if (target !== undefined) {
          updateDraft(get.registry, target, () => edit);
        }
      }),
    )
    .pipe(Atom.keepAlive);

  const attachComposerImagesAtomFn = atomRuntime
    .fn(
      Effect.fn('attachComposerImagesAtomFn', { root: true })(function* (
        source: ComposerImageSource,
        get: Atom.FnContext,
      ) {
        const { registry } = get;
        // Captured before any wait: the images land here even if Selected moves meanwhile.
        const { target } = registry.get(composerAtom);
        if (target === undefined) {
          return;
        }
        yield* Effect.annotateCurrentSpan('composer.attach.source', source._tag);
        const paths =
          source._tag === 'Paths'
            ? source.paths
            : yield* (yield* FileDialog).pickFiles({ filters: [...IMAGE_DIALOG_FILTERS], multiple: true });
        if (paths.length === 0) {
          return;
        }
        if (
          source._tag === 'Pick' &&
          currentAttachments(registry, target).length + paths.length > IMAGE_ATTACH_MAX_COUNT
        ) {
          return yield* new ImageAttachmentRejected({
            message: `At most ${String(IMAGE_ATTACH_MAX_COUNT)} images can be attached`,
          });
        }
        const picked = yield* Effect.forEach(paths, composerImageAttachmentFromPath, { concurrency: 'unbounded' });
        let rejected: ImageAttachmentRejected | undefined;
        updateDraft(registry, target, current => {
          const merged = appendUniqueComposerAttachments(current.attachments, picked);
          if (merged.length === current.attachments.length) {
            return undefined;
          }
          rejected = imageAttachmentsRejection(merged);
          return rejected === undefined ? { attachments: merged } : undefined;
        });
        if (rejected !== undefined) {
          return yield* rejected;
        }
      }),
      { concurrent: true },
    )
    .pipe(Atom.keepAlive);

  const submitComposerAtomFn = atomRuntime
    .fn(
      Effect.fn('submitComposerAtomFn', { root: true })(function* (mode: MidTurnSend | undefined, get: Atom.FnContext) {
        const { registry } = get;
        const { action, midTurnSend, target } = registry.get(composerAtom);
        if (target?._tag === 'Virtual') {
          yield* Effect.annotateCurrentSpan('composer.action', action._tag);
          if (action._tag === 'Send') {
            // The draft stays on the Virtual session until Materialize succeeds (ui ADR-0007).
            yield* sendVirtual(registry, materialized =>
              sendPromptTurn(registry, { ...materialized, text: materialized.draft }).pipe(
                // Refused before the user message was appended: the Session is Selected now, so the draft goes back.
                Effect.tapErrorTag('ComposerActionUnavailable', () =>
                  Effect.sync(() => {
                    restoreSessionDraft(registry, materialized.sessionId, materialized);
                  }),
                ),
              ),
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
        if (action._tag === 'Steer' && (mode ?? midTurnSend) === 'queue') {
          yield* Effect.annotateCurrentSpan('composer.midTurnSend', 'queue');
          if (queueSessionDraft(registry, sessionId, taken) === 'Started') {
            yield* sendQueued(registry, launchTarget, sessionId);
          }
          return;
        }
        const arg = { attachments: taken.attachments, launchTarget, sessionId, text: taken.draft };
        if (action._tag === 'Send') {
          // Once the Prompt turn has begun, a failed prompt leaves the message in the transcript, so the draft stays
          // taken. The Harness can still refuse a Send the Composer offered (it also checks Bootstrap phase); nothing
          // was appended then, so the draft goes back.
          yield* sendPromptTurn(registry, arg).pipe(
            Effect.tapErrorTag('ComposerActionUnavailable', () =>
              Effect.sync(() => {
                restoreSessionDraft(registry, sessionId, taken);
              }),
            ),
          );
          return;
        }
        yield* steerPromptTurn(registry, arg).pipe(
          Effect.onError(cause =>
            Cause.hasInterruptsOnly(cause) ||
            Cause.findErrorOption(cause).pipe(Option.exists(error => error instanceof SteerFallbackTurnFailed))
              ? Effect.void
              : Effect.sync(() => {
                  restoreSessionDraft(registry, sessionId, taken);
                }),
          ),
          // The Agent's refusal is already in the chat (Request error); the draft is back for another try.
          Effect.catchTag('SteeringRejected', () => Effect.void),
        );
      }),
      { concurrent: true },
    )
    .pipe(Atom.keepAlive);

  /** Put the Selected Session's Queued message back into its draft (Prompt turn cancel does this too). */
  const unqueueComposerAtomFn = atomRuntime
    .fn((_arg: undefined, get: Atom.FnContext) =>
      Effect.sync(() => {
        const { target } = get.registry.get(composerAtom);
        if (target?._tag !== 'Session') {
          return;
        }
        unqueueSessionDraft(get.registry, target.sessionId);
      }),
    )
    .pipe(Atom.keepAlive);

  /** Re-send `text` to a Session as a new Prompt turn (Session failure Retry); refused like any Send when not idle. */
  const resendPromptAtomFn = atomRuntime
    .fn(
      Effect.fn('resendPromptAtomFn', { root: true })(function* (
        arg: { readonly launchTarget: AgentLaunchTarget; readonly sessionId: string; readonly text: string },
        get: Atom.FnContext,
      ) {
        yield* sendPromptTurn(get.registry, arg);
      }),
    )
    .pipe(Atom.keepAlive);

  return {
    attachComposerImagesAtomFn,
    editComposerAtomFn,
    resendPromptAtomFn,
    submitComposerAtomFn,
    unqueueComposerAtomFn,
  };
};
