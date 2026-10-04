import { Atom } from 'effect/unstable/reactivity';

/** Persisted open state for the shared Developer panel (desktop + VS Code). */
export const DEVELOPER_PANEL_OPEN_STORAGE_KEY = 'ao-developer-panel-open';

export const readDeveloperPanelOpen = (): boolean => {
  try {
    return localStorage.getItem(DEVELOPER_PANEL_OPEN_STORAGE_KEY) === 'true';
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
