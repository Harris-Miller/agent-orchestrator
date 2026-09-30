/** Fixed Vite webview dev-server port — shared by host HTML and `vite.config.ts`. */
export const WEBVIEW_VITE_PORT = 5173;
export const WEBVIEW_VITE_ORIGIN = `http://localhost:${WEBVIEW_VITE_PORT}`;
export const WEBVIEW_VITE_WS_ORIGIN = WEBVIEW_VITE_ORIGIN.replace(/^http/, 'ws');
