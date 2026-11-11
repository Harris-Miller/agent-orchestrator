/**
 * Boot order shared by the desktop app and the VS Code webview: user settings load outside the gates that depend on
 * them; prerequisite gates (fd, Node) and Provider bootstrap come next; the host may add its own step (VS Code
 * boots Workspace folders); then caches hydrate and the long-running Harness workers mount. Skipping a step is a silent
 * bug, so hosts compose these two instead of the parts.
 */
import type { FC, ReactNode } from 'react';

import { AcpBackendsMount } from './AcpBackendsMount.tsx';
import { FdPrerequisiteGate } from './FdPrerequisiteGate.tsx';
import { HarnessCacheGate } from './HarnessCacheGate.tsx';
import { KeepAwakeMount } from './KeepAwakeMount.tsx';
import { NodePrerequisiteGate } from './NodePrerequisiteGate.tsx';
import { PersistUserSettingsToast } from './PersistUserSettingsToast.tsx';
import { ProviderBootstrapGate } from './ProviderBootstrapGate.tsx';
import { ProvidersStartupMount } from './providers/ProvidersStartupMount.tsx';
import { UserSettingsMount } from './UserSettingsMount.tsx';

/** User settings, then the fd and Node prerequisite gates and Provider bootstrap; `children` render once all pass. */
export const HarnessPrerequisites: FC<{
  readonly children: ReactNode;
  /** The host's way to quit when a prerequisite cannot be met. */
  readonly onExit: () => void;
}> = ({ children, onExit }) => (
  <>
    <UserSettingsMount />
    <PersistUserSettingsToast />
    <FdPrerequisiteGate onExit={onExit}>
      <NodePrerequisiteGate>
        <ProviderBootstrapGate>{children}</ProviderBootstrapGate>
      </NodePrerequisiteGate>
    </FdPrerequisiteGate>
  </>
);

/** Hydrate the Harness caches, then mount the Backend harnesses and their companions; `children` render once hydrated. */
export const HarnessMounts: FC<{ readonly children?: ReactNode }> = ({ children }) => (
  <HarnessCacheGate>
    <AcpBackendsMount />
    <KeepAwakeMount />
    <ProvidersStartupMount />
    {children}
  </HarnessCacheGate>
);
