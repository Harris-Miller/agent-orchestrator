import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';

/**
 * Overrides Effect's {@link FetchHttpClient.Fetch} with Tauri plugin-http so
 * OTLP (and any other FetchHttpClient traffic) runs in Rust and skips webview CORS.
 */
export const TauriFetchLive = Layer.succeed(FetchHttpClient.Fetch, tauriFetch);
