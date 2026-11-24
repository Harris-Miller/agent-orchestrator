/**
 * The telemetry key `appSessionId` is exported under. Also defined in `@lib/hub`'s `telemetryKeys.ts` (this package's
 * layers cannot import it); `telemetryKeys.test.ts` in `@lib/ui` asserts the two are equal.
 */
export const APP_SESSION_ID_ATTRIBUTE = 'app_session.id';

/**
 * Identifies one run of an app instance (a desktop window load or a VS Code webview load), not an ACP session. Generated
 * once per module load, so a new app run gets a new id. On the Harness it is an OTLP resource attribute (`app_session.id`), so it is on every
 * Harness log, span and metric. On the hub it is sent in the `/clients` handshake and set only on `hub.toolCall` spans and
 * client connect/disconnect logs.
 */
export const appSessionId: string = crypto.randomUUID();
