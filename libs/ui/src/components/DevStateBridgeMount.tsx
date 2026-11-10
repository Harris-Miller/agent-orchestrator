import { RegistryContext } from '@effect/atom-react';
import { useContext, useEffect } from 'react';

import { installDevStateBridge } from '../atoms/atomInspector.ts';
import { exportedAtomName } from '../atoms/atomNames.ts';

/** Exposes the registry's Atoms as `window.__HOA__` for MCP tools (Dev state bridge). Hosts mount it in dev builds only. */
export const DevStateBridgeMount = (): null => {
  const registry = useContext(RegistryContext);
  useEffect(() => installDevStateBridge(registry, window, exportedAtomName), [registry]);
  return null;
};
