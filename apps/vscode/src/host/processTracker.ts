import type { ChildProcess } from 'node:child_process';

export type TrackedChild = {
  readonly child: ChildProcess;
  readonly handleId: string;
};

/**
 * Per-webview child-process registry. Source of truth for kill on dispose/deactivate.
 */
export class ProcessTracker {
  private readonly byWebview = new Map<string, Map<string, TrackedChild>>();
  private nextHandle = 0;

  public readonly allocateHandleId = (): string => {
    this.nextHandle += 1;
    return `p-${this.nextHandle}`;
  };

  public readonly get = (webviewId: string, handleId: string): TrackedChild | undefined =>
    this.byWebview.get(webviewId)?.get(handleId);

  public readonly kill = (webviewId: string, handleId: string): void => {
    const tracked = this.get(webviewId, handleId);
    if (tracked === undefined) {
      return;
    }
    tracked.child.kill();
    this.unregister(webviewId, handleId);
  };

  public readonly killAll = (): void => {
    // oxlint-disable-next-line unicorn/no-useless-spread -- Deleting during iteration requires a snapshot.
    for (const webviewId of [...this.byWebview.keys()]) {
      this.killAllForWebview(webviewId);
    }
  };

  public readonly killAllForWebview = (webviewId: string): void => {
    const set = this.byWebview.get(webviewId);
    if (set === undefined) {
      return;
    }
    for (const tracked of set.values()) {
      tracked.child.kill();
    }
    this.byWebview.delete(webviewId);
  };

  public readonly register = (webviewId: string, handleId: string, child: ChildProcess): void => {
    let set = this.byWebview.get(webviewId);
    if (set === undefined) {
      set = new Map();
      this.byWebview.set(webviewId, set);
    }
    set.set(handleId, { child, handleId });
  };

  public readonly unregister = (webviewId: string, handleId: string): void => {
    this.byWebview.get(webviewId)?.delete(handleId);
  };
}
