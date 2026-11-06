/**
 * The Composer action, decided once (glossary: Composer action; desktop ADR-0018, ui ADR-0007).
 *
 * - {@link turnAction}: the rule for one Session. Every effect that prompts or steers consults it, so the Harness
 *   refuses whatever the Composer would not offer.
 * - {@link composerGates}: the Composer's view over the Selected target. For a Session it is {@link turnAction} plus
 *   the Handoff lock; the Virtual arm adds readiness, the Lifecycle lock and Send pending. It can only be stricter
 *   than {@link turnAction}, never laxer.
 */
import type { AcpBootstrapPhase, SessionSnapshot } from './acpSessionBootstrap.ts';
import type { AgentLaunchTarget } from './agentLaunchTarget.ts';

export type ComposerUnavailableReason =
  | 'Empty'
  | 'Locked'
  | 'NotActive'
  | 'NotReady'
  | 'PendingClientRequest'
  | 'PendingInteraction'
  | 'SendPending';

export type ComposerAction =
  | { readonly _tag: 'CancelTurn' }
  | { readonly _tag: 'Send' }
  | { readonly _tag: 'Steer' }
  | { readonly _tag: 'Unavailable'; readonly reason: ComposerUnavailableReason };

export type TurnActionInput = {
  readonly hasContent: boolean;
  readonly steeringSupported: boolean;
};

const unavailable = (reason: ComposerUnavailableReason): ComposerAction => ({ _tag: 'Unavailable', reason });

/** A permission or elicitation request awaits the user. */
export const hasPendingInteraction = (session: SessionSnapshot): boolean =>
  session.pendingElicitation !== undefined || session.pendingPermission !== undefined;

/** What submitting a draft into `session` does right now. */
export const turnAction = (
  session: SessionSnapshot | undefined,
  { hasContent, steeringSupported }: TurnActionInput,
): ComposerAction => {
  if (session?.pendingClientRequest === 'prompt') {
    const steeringAvailable =
      session.status === 'active' &&
      steeringSupported &&
      session.promptCancelRequested !== true &&
      !hasPendingInteraction(session) &&
      hasContent;
    return steeringAvailable ? { _tag: 'Steer' } : { _tag: 'CancelTurn' };
  }
  if (session?.pendingClientRequest !== undefined) {
    return unavailable('PendingClientRequest');
  }
  if (session?.status !== 'active') {
    return unavailable('NotActive');
  }
  if (hasPendingInteraction(session)) {
    return unavailable('PendingInteraction');
  }
  return hasContent ? { _tag: 'Send' } : unavailable('Empty');
};

/** The Selected target as the Composer sees it. Nothing Selected is the Session arm with no session. */
export type ComposerSubject =
  | {
      readonly _tag: 'Session';
      readonly handoffInProgress: boolean;
      readonly hasContent: boolean;
      readonly session: SessionSnapshot | undefined;
      readonly steeringSupported: boolean;
    }
  | {
      readonly _tag: 'Virtual';
      readonly cwd: string | undefined;
      readonly handoffInProgress: boolean;
      readonly hasContent: boolean;
      readonly launchTarget: AgentLaunchTarget | undefined;
      /** Lifecycle lock held (Materialize). */
      readonly materializing: boolean;
      /** Phase of the Virtual launch target's provider; `undefined` with no launch target. */
      readonly providerPhase: AcpBootstrapPhase | undefined;
      readonly sendPending: boolean;
    };

export type ComposerGates = {
  readonly action: ComposerAction;
  /** Draft text and attachments are editable (Draft during turn stays editable). */
  readonly canEdit: boolean;
  /** Config, provider and split-menu controls are enabled. */
  readonly controlsEnabled: boolean;
  /** A Handoff runs, or (Virtual) the Lifecycle lock is held. */
  readonly locked: boolean;
};

export const composerGates = (subject: ComposerSubject): ComposerGates => {
  if (subject._tag === 'Virtual') {
    const locked = subject.handoffInProgress || subject.materializing;
    const ready = subject.launchTarget !== undefined && subject.cwd !== undefined && subject.providerPhase !== 'error';
    const action: ComposerAction = subject.sendPending
      ? unavailable('SendPending')
      : locked
        ? unavailable('Locked')
        : !ready
          ? unavailable('NotReady')
          : subject.hasContent
            ? { _tag: 'Send' }
            : unavailable('Empty');
    return { action, canEdit: !locked && !subject.sendPending, controlsEnabled: !locked, locked };
  }
  const { handoffInProgress: locked, session, steeringSupported } = subject;
  const action = turnAction(session, subject);
  return {
    // Steering and Prompt turn cancel stay available during a Handoff; only a new Send is locked out.
    action: action._tag === 'Send' && locked ? unavailable('Locked') : action,
    canEdit: session?.status === 'active' && !locked,
    controlsEnabled: !locked && turnAction(session, { hasContent: true, steeringSupported })._tag === 'Send',
    locked,
  };
};
