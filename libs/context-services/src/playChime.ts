/// <reference lib="dom" />
import { Effect } from 'effect';

import { NotifyFailed } from './Notifier.ts';

let sharedContext: AudioContext | undefined;

const failed = (cause: unknown): NotifyFailed =>
  new NotifyFailed({ cause, message: cause instanceof Error ? cause.message : String(cause) });

const NOTES_HZ = [880, 1318.5];
const NOTE_SECONDS = 0.16;
const PEAK_GAIN = 0.15;
const RESUME_TIMEOUT_MS = 250;

/**
 * Two-note chime synthesized with Web Audio (no audio asset). Shared by Live Adapters that run in a webview.
 * Tries to resume a suspended context for a bounded time; if autoplay is still blocked the chime is silently dropped.
 */
export const playChime: Effect.Effect<void, NotifyFailed> = Effect.tryPromise({
  catch: failed,
  try: async () => {
    if (sharedContext === undefined || sharedContext.state === 'closed') {
      // oxlint-disable-next-line no-undef -- Web Audio global, typed via the dom lib reference above
      sharedContext = new AudioContext();
    }
    const context = sharedContext;
    const isRunning = () => (context.state as string) === 'running';
    if (!isRunning()) {
      // resume() can stay pending forever without a user gesture, so bound the wait.
      await Promise.race([
        context.resume().catch(() => undefined),
        new Promise<void>(resolve => {
          setTimeout(resolve, RESUME_TIMEOUT_MS);
        }),
      ]);
      if (!isRunning()) return;
    }
    const start = context.currentTime;
    for (const [index, hz] of NOTES_HZ.entries()) {
      const at = start + index * NOTE_SECONDS;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_SECONDS * 1.5);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + NOTE_SECONDS * 1.5);
    }
  },
});
