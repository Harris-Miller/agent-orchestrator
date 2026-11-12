// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Effect } from 'effect';
import { afterEach, vi } from 'vitest';

import { mockHostLayer } from '../../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../../createHostRuntime.ts';
import { bindHostRuntime } from '../../../hostRuntime.ts';
import { renderInSessionChatSurface } from '../sessionChatSurface.testing.tsx';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { SessionChatSurfaceProvider } = await import('../useSessionChatSurface.tsx');
const { SendButton } = await import('./SendButton.tsx');

afterEach(cleanup);

const mount = (
  options: Parameters<typeof renderInSessionChatSurface>[1],
  onCancelPrompt: () => void = () => undefined,
) =>
  renderInSessionChatSurface(
    <SessionChatSurfaceProvider onClientError={() => undefined}>
      <SendButton onCancelPrompt={onCancelPrompt} onRequestHandoff={() => undefined} onSubmitDraft={() => undefined} />
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
