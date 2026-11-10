import { RegistryContext } from '@effect/atom-react';
import { useContext, useEffect } from 'react';

import { installAtomDebugBridge } from '../atoms/atomInspector.ts';
import { exportedAtomName } from '../atoms/atomNames.ts';

/** Dev state bridge: exposes the registry's Atoms as `window.__HOA__` for MCP tools. Hosts mount it in dev builds only. */
export const AtomDebugBridge = (): null => {
  const registry = useContext(RegistryContext);
  useEffect(() => installAtomDebugBridge(registry, window, exportedAtomName), [registry]);
  return null;
};
