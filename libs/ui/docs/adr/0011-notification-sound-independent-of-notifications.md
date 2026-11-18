# Notification sound is independent of Notifications

Supersedes [0006](0006-notification-sound-rides-notification.md). Notifications and Notification sound are separate settings: none, notification only, sound only, or both. With both on, one OS Notification carries the system sound (`notify({ sound: true })`) and the app plays nothing extra. With Notifications off and sound on, the app plays a short chime itself (`Notifier.playSound`), synthesized with Web Audio in the webview so no audio asset ships and no CSP changes; both webview Live Adapters share one helper. The standalone chime ignores OS Do Not Disturb, so "Only notify when window unfocused" gates it too (a focused window never beeps). An `'in-app'` Notifier has no sound, so its `playSound` is a no-op. Browsers may keep an audio context suspended until a user gesture; the helper resumes it and treats a block as a swallowed `NotifyFailed`. Per-platform autoplay behavior in the VS Code webview and Tauri webviews (macOS, Windows) is not yet manually verified.

## Considered options

- **Bundled audio file:** an asset to ship and a CSP/media path per Host; a synthesized tone is enough. Revisit only if the tone is not acceptable.
- **Always play the chime alongside a Notification:** doubles the sound when the OS already plays one.
