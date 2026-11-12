import { RegistryContext } from '@effect/atom-react';
import { ThemeProvider } from '@mui/material/styles';
import { render } from '@testing-library/react';
import { Effect } from 'effect';
import { AtomRegistry } from 'effect/reactivity';
import type { ReactNode } from 'react';

import { CODEX, enableProviders } from '../../atoms/fakeAgent.testing.ts';
import { updateHarnessSnapshot } from '../../atoms/harnessSnapshot.ts';
import { select } from '../../atoms/virtualSession.atoms.ts';
import type { SessionSnapshot } from '../../host/acpSessionBootstrap.ts';
import { initialSessionSnapshot } from '../../host/acpSessionBootstrap.ts';
import { NO_AGENT_CAPABILITIES } from '../../host/agentCapabilities.ts';
import type { AgentCapabilities } from '../../host/agentCapabilities.ts';
import { theme } from '../../theme/themes.ts';

/**
 * Renders `ui` inside the themed registry with Codex `ready` and Session `s1` Selected, seeded from `session` and
 * `capabilities`. Callers wrap `ui` in `SessionChatSurfaceProvider` themselves, importing it after
 * `bindHostRuntime(createHostRuntime(mockHostLayer))` so the atoms bind to the mock host.
 */
export const renderInSessionChatSurface = (
  ui: ReactNode,
  options: {
    readonly capabilities?: Partial<AgentCapabilities>;
    readonly session?: Partial<SessionSnapshot>;
  } = {},
) =>
  Effect.gen(function* () {
    const registry = AtomRegistry.make();
    enableProviders(registry, [CODEX]);
    updateHarnessSnapshot(registry, CODEX, current => ({
      ...current,
      agentCapabilities: { ...NO_AGENT_CAPABILITIES, ...options.capabilities },
      phase: 'ready',
      sessions: { s1: { ...initialSessionSnapshot('s1', 'active'), ...options.session } },
    }));
    yield* select(registry, { _tag: 'Session', sessionId: 's1' });
    const view = render(
      <RegistryContext.Provider value={registry}>
        <ThemeProvider theme={theme}>{ui}</ThemeProvider>
      </RegistryContext.Provider>,
    );
    return { registry, view };
  });
