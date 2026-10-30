# Chat links dispatch through Host services

Chat Markdown links use a scheme allowlist and dispatch through `OpenUrl` or Host-supported `OpenFile`; the renderer never emits a navigating `<a href>`. `OpenFile.supported` controls file-link affordance, and unsupported schemes remain inert.

## Considered options

- **Real `<a>` with navigation interception:** rejected because webview navigation can break the shell and interception is host-specific.
- **Optional service via `serviceOption`:** rejected because OpenFile is part of the portable Host contract and every Host should declare support explicitly.
- **Always clickable and fail on click:** rejected because unsupported file links must not advertise an action.
