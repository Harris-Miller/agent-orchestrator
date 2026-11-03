/** What the primary Composer button does while a Session is idle or has a prompt in flight. */
export type ComposerTurnActions = {
  /** Draft can be sent as a steering message into the in-flight turn. */
  readonly canSteer: boolean;
  readonly primaryAction: 'send' | 'steer' | 'stop';
};

export const composerTurnActions = (input: {
  readonly canCancelPromptTurn: boolean;
  readonly hasPendingInteraction: boolean;
  readonly hasSendableContent: boolean;
  readonly steeringSupported: boolean;
}): ComposerTurnActions => {
  if (!input.canCancelPromptTurn) {
    return { canSteer: false, primaryAction: 'send' };
  }
  const canSteer = input.steeringSupported && !input.hasPendingInteraction && input.hasSendableContent;
  return { canSteer, primaryAction: canSteer ? 'steer' : 'stop' };
};
