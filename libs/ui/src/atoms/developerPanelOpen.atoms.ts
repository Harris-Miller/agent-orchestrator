import { Atom } from 'effect/unstable/reactivity';

import { isRecord } from '../isRecord.ts';

/** Persisted open state for the shared Developer panel (desktop + VS Code). */
export const DEVELOPER_PANEL_OPEN_STORAGE_KEY = 'ao-developer-panel-open';

const WORKBENCH_LAYOUT_KEY = 'agent-chat-workbench-layout';
const VSCODE_LAYOUT_KEY = 'ao-vscode-app-layout';
const VSCODE_LAYOUT_KEY_LEGACY = 'ao-vscode-developer-panel-layout';

const readLegacyOpenFromJson = (raw: null | string): boolean | undefined => {
  if (raw == null) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return undefined;
    }
    if (typeof parsed.developerPanelOpen === 'boolean') {
      return parsed.developerPanelOpen;
    }
    if (typeof parsed.rpcWireLogOpen === 'boolean') {
      return parsed.rpcWireLogOpen;
    }
    return undefined;
  } catch {
    return undefined;
  }
};

/** Best-effort read; migrates from older workbench / VS Code layout blobs once. */
export const readDeveloperPanelOpen = (): boolean => {
  try {
    const raw = localStorage.getItem(DEVELOPER_PANEL_OPEN_STORAGE_KEY);
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
    const legacy =
      readLegacyOpenFromJson(localStorage.getItem(WORKBENCH_LAYOUT_KEY)) ??
      readLegacyOpenFromJson(localStorage.getItem(VSCODE_LAYOUT_KEY)) ??
      readLegacyOpenFromJson(localStorage.getItem(VSCODE_LAYOUT_KEY_LEGACY));
    const open = legacy === true;
    localStorage.setItem(DEVELOPER_PANEL_OPEN_STORAGE_KEY, open ? 'true' : 'false');
    return open;
  } catch {
    return false;
  }
};

export const writeDeveloperPanelOpen = (open: boolean): void => {
  try {
    localStorage.setItem(DEVELOPER_PANEL_OPEN_STORAGE_KEY, open ? 'true' : 'false');
  } catch {
    // layout preference is best-effort
  }
};

export const developerPanelOpenAtom = Atom.writable(
  () => readDeveloperPanelOpen(),
  (ctx, open: boolean) => {
    writeDeveloperPanelOpen(open);
    ctx.setSelf(open);
  },
).pipe(Atom.keepAlive);
