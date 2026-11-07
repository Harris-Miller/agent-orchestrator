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
 *   Prompt turn cancel stays `cancelPromptAtomFn`.
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
 * - Every write goes through the registry (a re-invoked AtomFn's `FnContext.set` is a no-op).
 */
import { FileDialog } from '@lib/context-services';
import { Cause, Effect, Option } from 'effect';
import { Atom } from 'effect/reactivity';
import type { AtomRegistry } from 'effect/reactivity';

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
  selectedBackendHarnessSnapshotAtom,
  selectedSessionAtom,
  selectedSessionLaunchTargetAtom,
} from './backendState.atoms.ts';
import { handoffInProgressAtom } from './handoff.atoms.ts';
import { sendPromptTurn, SteerFallbackTurnFailed, steerPromptTurn } from './promptTurn.ts';
import {
  sendVirtual,
  updateVirtualDraft,
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
      handoffInProgress,
      hasContent: hasContent(draft),
      session,
      steeringSupported: get(selectedBackendHarnessSnapshotAtom)?.agentCapabilities.steering ?? false,
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

/** Put a failed Steering or refused Send back into its Session's draft, ahead of anything typed since. */
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
      Effect.fn('submitComposerAtomFn', { root: true })(function* (_arg: undefined, get: Atom.FnContext) {
        const { registry } = get;
        const { action, target } = registry.get(composerAtom);
        if (target?._tag === 'Virtual') {
          yield* Effect.annotateCurrentSpan('composer.action', action._tag);
          if (action._tag === 'Send') {
            // The draft stays on the Virtual session until Materialize succeeds (ui ADR-0007).
            yield* sendVirtual(registry, materialized =>
              sendPromptTurn(registry, { ...materialized, text: materialized.draft }),
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
        );
      }),
      { concurrent: true },
    )
    .pipe(Atom.keepAlive);

  return { attachComposerImagesAtomFn, editComposerAtomFn, submitComposerAtomFn };
};
