# Notification sound is independent of Notifications

Supersedes [0006](0006-notification-sound-rides-notification.md). Notifications and Notification sound are separate settings: none, notification only, sound only, or both. The OS Notification is always silent (`sound: false`); the Notification sound is always the app's own short in-app chime, so the sound is identical whether or not Notifications is on. The chime ignores OS Do Not Disturb, so "Only notify when window unfocused" gates it too: a focused window never beeps. Autoplay behavior in the Tauri webviews (macOS, Windows) and the VS Code webview is not yet manually verified.

## Considered options

- **Always play the chime alongside a Notification:** doubles the sound when the OS already plays one.
