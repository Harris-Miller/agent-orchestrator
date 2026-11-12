import { RegistryContext } from '@effect/atom-react';
import { ThemeProvider } from '@mui/material/styles';
import { render } from '@testing-library/react';
import type { UserSettings } from '@lib/hoa-home';
import { Effect } from 'effect';
import { AsyncResult, AtomRegistry } from 'effect/reactivity';
import type { ReactNode } from 'react';

import { CODEX, enableProviders } from '../../atoms/fakeAgent.testing.ts';
import { updateHarnessSnapshot } from '../../atoms/harnessSnapshot.ts';
import { unwrapUserSettings, userSettingsDocumentAtom } from '../../atoms/userSettings/userSettingsDocument.atoms.ts';
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
    /** User settings merged over the test's defaults (the document counts as loaded). */
    readonly settings?: UserSettings;
  } = {},
) =>
  Effect.gen(function* () {
    const registry = AtomRegistry.make();
    enableProviders(registry, [CODEX]);
    registry.set(
      userSettingsDocumentAtom,
      AsyncResult.success({ ...unwrapUserSettings(registry.get(userSettingsDocumentAtom)), ...options.settings }),
    );
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
