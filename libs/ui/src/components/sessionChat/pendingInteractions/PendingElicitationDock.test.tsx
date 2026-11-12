// @vitest-environment happy-dom
import { assert, describe, it } from '@effect/vitest';
import { cleanup } from '@testing-library/react';
import { Effect } from 'effect';
import { afterEach } from 'vitest';

import { mockHostLayer } from '../../../atoms/mockHostLayer.testing.ts';
import { createHostRuntime } from '../../../createHostRuntime.ts';
import { bindHostRuntime } from '../../../hostRuntime.ts';
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
});
