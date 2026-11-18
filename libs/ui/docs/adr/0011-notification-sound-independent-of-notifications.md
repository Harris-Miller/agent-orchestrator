# Notification sound is independent of Notifications

Supersedes [0006](0006-notification-sound-rides-notification.md). Notifications and Notification sound are separate settings: none, notification only, sound only, or both. With both on, one OS Notification carries the system sound and the app plays nothing extra. With Notifications off and sound on, the app plays a short chime itself, so users who find OS banners noisy can still get an audible cue. The standalone chime ignores OS Do Not Disturb, so "Only notify when window unfocused" gates it too: a focused window never beeps. Autoplay behavior in the Tauri webviews (macOS, Windows) and the VS Code webview is not yet manually verified.

## Considered options

- **Always play the chime alongside a Notification:** doubles the sound when the OS already plays one.
