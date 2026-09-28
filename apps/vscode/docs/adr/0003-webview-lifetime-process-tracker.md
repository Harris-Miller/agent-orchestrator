# ADR 0003: Webview lifetime equals session lifetime for tracked processes

## Status

Accepted

## Context

ACP adapter children and vendor-auth short-lived spawns must not orphan when the sidebar webview is disposed or the extension deactivates. `retainContextWhenHidden` keeps the webview JS alive while hidden, but dispose/deactivate still tear down the view.

## Decision

Treat **webview Host lifetime as the session lifetime for Host-tracked children**: the extension-host `ProcessTracker` is source of truth; `onDidDispose` and `deactivate` kill that webview’s (or all) tracked set. Extension allocates opaque spawn handle ids.

## Consequences

- Webview `kill` is an IPC request that also unregisters.
- Duplicate kill is acceptable; tracker wins on teardown.
- Formal hide/dispose phase E2E remains on issue #70.
