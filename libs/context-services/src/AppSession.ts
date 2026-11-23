/**
 * Identifies one run of an app instance (a desktop window load or a VS Code webview load), not an ACP session. Generated
 * once per module load, so a new app run gets a new id. Attached to every Harness and hub log, span and metric.
 */
export const appSessionId: string = crypto.randomUUID();
