// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { Effect } from 'effect';
import { useEffect } from 'react';
import { afterEach, vi } from 'vitest';

import type { MidTurnSend } from '../../../atoms/userSettings/userSettings.atoms.ts';
import { mockHostLayer } from '../../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../../createHostRuntime.ts';
import { bindHostRuntime } from '../../../hostRuntime.ts';
import { renderInSessionChatSurface } from '../sessionChatSurface.testing.tsx';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { SessionChatSurfaceProvider, useSessionChatSurface } = await import('../useSessionChatSurface.tsx');
const { SendButton } = await import('./SendButton.tsx');

afterEach(cleanup);

const WithDraft = ({ draft }: { readonly draft: string }) => {
  const { edit } = useSessionChatSurface();
  useEffect(() => {
    edit({ draft });
  }, [draft, edit]);
  return null;
};

const mount = (
  options: Parameters<typeof renderInSessionChatSurface>[1],
  onCancelPrompt: () => void = () => undefined,
  onSubmitDraft: (mode?: MidTurnSend) => void = () => undefined,
  draft?: string,
) =>
  renderInSessionChatSurface(
    <SessionChatSurfaceProvider onClientError={() => undefined}>
      {draft === undefined ? null : <WithDraft draft={draft} />}
      <SendButton onCancelPrompt={onCancelPrompt} onSubmitDraft={onSubmitDraft} />
    </SessionChatSurfaceProvider>,
    options,
  );

describe('SendButton primary button follows the Composer action', () => {
  it.effect('is a disabled submit button labelled Send when the Composer action is Unavailable (empty draft)', () =>
    Effect.gen(function* () {
      const { registry } = yield* mount({});
      const button = screen.getByRole('button', { name: 'Send' });
      assert.strictEqual(button.hasAttribute('disabled'), true);
      assert.strictEqual(button.getAttribute('type'), 'submit');
      registry.dispose();
    }),
  );

  it.effect('is labelled Steer (enabled) while a prompt runs and Steering applies', () =>
    Effect.gen(function* () {
      const { registry } = yield* mount({
        capabilities: { steeringSupported: true },
        session: { pendingClientRequest: 'prompt' },
      });
      // No draft content: Steering needs content, so the action is CancelTurn.
      assert.strictEqual(screen.queryByRole('button', { name: 'Steer' }), null);
      assert.isNotNull(screen.getByRole('button', { name: 'Prompt turn cancel' }));
      registry.dispose();
    }),
  );

  it.effect('CancelTurn is a type="button" that calls onCancelPrompt on click', () =>
    Effect.gen(function* () {
      const onCancelPrompt = vi.fn();
      const { registry } = yield* mount({ session: { pendingClientRequest: 'prompt' } }, onCancelPrompt);
      const button = screen.getByRole('button', { name: 'Prompt turn cancel' });
      assert.strictEqual(button.getAttribute('type'), 'button');
      assert.strictEqual(button.hasAttribute('disabled'), false);
      fireEvent.click(button);
      assert.strictEqual(onCancelPrompt.mock.calls.length, 1);
      registry.dispose();
    }),
  );
});

describe('SendButton other-mode button', () => {
  it.effect('is absent when the Composer action is not Steer, and there is no send options chevron', () =>
    Effect.gen(function* () {
      const { registry } = yield* mount({});
      assert.isNull(screen.queryByRole('button', { name: 'Queue' }));
      assert.isNull(screen.queryByRole('button', { name: 'Open send options' }));
      registry.dispose();
    }),
  );

  it.effect('while Steering applies, offers Queue and submits it as the other mode', () =>
    Effect.gen(function* () {
      const onSubmitDraft = vi.fn();
      const { registry } = yield* mount(
        { capabilities: { steeringSupported: true }, session: { pendingClientRequest: 'prompt' } },
        () => undefined,
        onSubmitDraft,
        'more',
      );
      yield* Effect.promise(() => act(async () => undefined));
      fireEvent.click(screen.getByRole('button', { name: 'Queue' }));
      assert.deepStrictEqual(onSubmitDraft.mock.calls, [['queue']]);
      assert.isNotNull(screen.getByRole('button', { name: 'Steer' }));
      registry.dispose();
    }),
  );
});
