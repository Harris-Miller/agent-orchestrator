// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { cleanup } from '@testing-library/react';
import { Effect } from 'effect';
import { afterEach } from 'vitest';

import { mockHostLayer } from '../../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../../createHostRuntime.ts';
import { bindHostRuntime } from '../../../hostRuntime.ts';
import type { PendingElicitation } from '../../../host/pendingInteractions.ts';
import { renderInSessionChatSurface } from '../sessionChatSurface.testing.tsx';

bindHostRuntime(createHostRuntime(mockHostLayer));
const { SessionChatSurfaceProvider } = await import('../useSessionChatSurface.tsx');
const { PendingElicitationDock } = await import('./PendingElicitationDock.tsx');

afterEach(cleanup);

describe('PendingElicitationDock', () => {
  it.effect('renders nothing without a Pending elicitation', () =>
    Effect.gen(function* () {
      const { registry, view } = yield* renderInSessionChatSurface(
        <SessionChatSurfaceProvider onClientError={() => undefined}>
          <PendingElicitationDock />
        </SessionChatSurfaceProvider>,
      );
      assert.strictEqual(view.container.innerHTML, '');
      registry.dispose();
    }),
  );

  it.effect('shows the oldest Pending elicitation and how many more wait behind it', () =>
    Effect.gen(function* () {
      const elicitation = (id: string, message: string): PendingElicitation => ({
        id,
        request: { message, mode: 'form', requestedSchema: { properties: {}, type: 'object' }, sessionId: 's1' },
        resolve: () => undefined,
        sessionId: 's1',
      });
      const { registry, view } = yield* renderInSessionChatSurface(
        <SessionChatSurfaceProvider onClientError={() => undefined}>
          <PendingElicitationDock />
        </SessionChatSurfaceProvider>,
        {
          session: {
            pendingElicitation: elicitation('e1', 'First question'),
            waitingElicitations: [elicitation('e2', 'Second question'), elicitation('e3', 'Third question')],
          },
        },
      );
      assert.isNotNull(view.queryByText('First question'));
      assert.isNull(view.queryByText('Second question'));
      assert.isNotNull(view.queryByText('2 more waiting'));
      registry.dispose();
    }),
  );
});
