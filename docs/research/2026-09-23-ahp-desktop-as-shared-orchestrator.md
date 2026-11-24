# AHP as shared desktop orchestrator for multi-client sync?

Date: 2026-09-23  
Question: Can Microsoft’s **Agent Host Protocol (AHP)** be the always-running layer in `apps/desktop` (menu bar / tray) so multiple VS Code windows (and the desktop UI) share live sessions — instead of (or after) issue #65’s webview-owned Agent Harness? Is the original #65 plan fine as-is, and is there an easier sync path without adopting AHP?

## Summary

| Claim                                                      | Verdict                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AHP designed for multi-client attach to same live session? | **Yes** — that is AHP’s stated purpose (N clients ↔ one authoritative host; subscribe/broadcast/`serverSeq`).                                                                                                    |
| AHP replaces ACP / this repo’s Effect Atom harness?        | **No** — complementary layers. Host speaks **AHP up** to UIs and **ACP down** to agent subprocesses. Adopting AHP means a **new host process + agent-event mapper**, not a drop-in WS in front of today’s atoms. |
| Use AHP _now_ as the desktop orchestrator?                 | **No** — wrong cost/lock-in for current product; conflicts with #65’s explicit product rule (webview lifetime = session lifetime; host-owned harness rejected).                                                  |
| Is #65 as-is fine?                                         | **Yes** for Providers + chat-for-cwd **per window**. It deliberately forgoes live cross-window sync.                                                                                                             |
| Easier live sync without AHP?                              | **Yes** — thin custom local JSON-RPC/WS over the existing harness (Option C), or cold `session/list` + `session/load` (no live sync). Full AHP is the heavy interoperability play, not the lazy sync play.       |

**Ranked options (effort ↑ / sync capability ↑):**

| Option                             | Live sync desktop + N VS Code windows | Effort             | Fit to #65                                              |
| ---------------------------------- | ------------------------------------- | ------------------ | ------------------------------------------------------- |
| **A** — Stick with #65             | No (dispose ends session)             | Lowest             | Matches                                                 |
| **C1** — Agent-persisted cold load | After reconnect only                  | Low                | Compatible                                              |
| **C2** — Thin custom WS/host       | Yes (home-grown)                      | Medium             | Conflicts with #65 rule unless deferred                 |
| **D** — #65 now, shared host later | Later                                 | Medium (sequenced) | Intended path if sync becomes a product need            |
| **B** — Full AHP host in desktop   | Yes (spec-shaped)                     | Highest            | Conflicts; rebuilds coordination around AHP state model |

## What AHP actually is

Primary sources: [AHP overview](https://microsoft.github.io/agent-host-protocol/), [spec overview](https://microsoft.github.io/agent-host-protocol/specification/overview.html), [transport](https://microsoft.github.io/agent-host-protocol/specification/transport.html), [lifecycle](https://microsoft.github.io/agent-host-protocol/specification/lifecycle.html), [channels & subscriptions](https://microsoft.github.io/agent-host-protocol/specification/subscriptions.html), [root](https://microsoft.github.io/agent-host-protocol/specification/root-channel.html) / [session](https://microsoft.github.io/agent-host-protocol/specification/session-channel.html) / [chat](https://microsoft.github.io/agent-host-protocol/specification/chat-channel.html) channels, [AHP ↔ ACP guide](https://microsoft.github.io/agent-host-protocol/guide/ahp-and-acp.html), [GitHub README](https://github.com/microsoft/agent-host-protocol).

### Problem it solves

AHP’s home page and guide state the problem plainly: an agent session is “stuck wherever it started”; AHP makes a session a **shared, synchronized resource** any number of clients can attach to. One host sits between many clients and many agents (LSP/DAP lineage). Every mutation is one totally ordered envelope (`serverSeq`) broadcast to subscribers; clients apply optimistically and reconcile on echo.

### Wire model

- **JSON-RPC 2.0**, transport-agnostic; any reliable ordered bidirectional stream. WebSocket is the common cross-process choice; the VS Code implementation uses WS ([transport](https://microsoft.github.io/agent-host-protocol/specification/transport.html)).
- **Channels** are URI-identified subscribable resources. Every command/notification carries top-level `params.channel` ([subscriptions](https://microsoft.github.io/agent-host-protocol/specification/subscriptions.html)):
  - `ahp-root://` — agents catalogue, host config, session catalogue events (`root/sessionAdded|Removed|SummaryChanged`)
  - `ahp-session:/<uuid>` — session metadata, `chats` catalog, `activeClients`, `inputNeeded`, config
  - `ahp-chat:/<uuid>` — turns, streaming deltas, tool calls, drafts, input requests
  - plus terminals, changesets, automations, OTLP, resource-watch, …
- Clients `subscribe` → receive a **snapshot** + subsequent `action` envelopes; `dispatchAction` for client→server mutations; `reconnect` with `lastSeenServerSeq` for replay or fresh snapshots ([lifecycle](https://microsoft.github.io/agent-host-protocol/specification/lifecycle.html)).
- Multi-subscriber sync is first-class: actions go to **all** clients subscribed to that channel URI ([subscriptions](https://microsoft.github.io/agent-host-protocol/specification/subscriptions.html)). Session state tracks `activeClients` (per `clientId` from `initialize`) ([session state types](https://github.com/microsoft/agent-host-protocol/blob/main/types/channels-session/state.ts)).

### Designed for tray-hosted host + IDE plugins as clients?

Yes in architecture terms: a “standalone server (or Electron utility process)” speaking AHP to clients and ACP to agents ([AHP ↔ ACP guide](https://microsoft.github.io/agent-host-protocol/guide/ahp-and-acp.html)). Transport docs explicitly call out WebSocket for remote/cross-process and note VS Code’s use of WS. IDE plugins as AHP clients match the published TypeScript client and the “VS Code (built-in Agent Sessions client)” mention in the [repo README](https://github.com/microsoft/agent-host-protocol).

Nothing in the spec requires a visible window; nothing forbids a tray/daemon host. Process ownership of agent children belongs to the **host**, not each IDE webview.

### Maturity & implementability (2026-09)

| Signal            | Fact                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Spec SemVer       | `spec/v0.9.0` (2026-08-28); still **0.x** — SemVer says pre-1.0 minors are not cross-compatible without negotiation ([versioning](https://microsoft.github.io/agent-host-protocol/specification/versioning.md); [releases](https://github.com/microsoft/agent-host-protocol/releases)). **Softened for this product:** if only this repo’s clients connect (desktop UI + `apps/vscode`), pin host+client to one shipped wire shape and skip multi-party negotiation — 0.x churn is then a monorepo bump cost, not an interoperability tax. |
| Channel stability | Root / Session / Chat / Terminal / Resource watch / Telemetry marked **Stability 2 – Stable**; Changeset & MCP **1.2 RC**; Automations **1.0 experimental** ([versioning](https://microsoft.github.io/agent-host-protocol/specification/versioning.md))                                                                                                                                                                                                                                                                                    |
| Client SDK        | npm `@microsoft/agent-host-protocol` (0.9.0): wire types, reducers, `AhpClient`, `WebSocketTransport`, `MultiHostClient` — **client libraries**, not a host runtime ([README](https://github.com/microsoft/agent-host-protocol/blob/main/clients/typescript/README.md), [npm](https://www.npmjs.com/package/@microsoft/agent-host-protocol))                                                                                                                                                                                               |
| JSON Schema       | Published on spec releases (`state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | actions | commands | notifications | errors.schema.json`) ([spec overview](https://microsoft.github.io/agent-host-protocol/specification/overview.html); [spec/v0.9.0 assets](https://github.com/microsoft/agent-host-protocol/releases/tag/spec%2Fv0.9.0)) |
| Reference host    | **VS Code agent host** (`src/vs/platform/agentHost/node/` inside microsoft/vscode) — not a reusable Tauri package. Community example: [pi-ahp](https://github.com/Qusic/pi-ahp) ([README](https://github.com/microsoft/agent-host-protocol))                                                                                                                                                                                                                                                                                               |
| Repo age          | Created 2026-03; ~360 stars as of research date                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**Implication:** adopting AHP means **implementing (or forking) a host**, plus an ACP→AHP event mapper. Client SDK alone does not give you a desktop orchestrator.

## AHP vs ACP (this repo)

### Layers

| Layer                          | Protocol | Role in ideal stack                                                               |
| ------------------------------ | -------- | --------------------------------------------------------------------------------- |
| Many UIs ↔ one authority       | **AHP**  | Subscriptions, sequencing, multi-client arbitration                               |
| One client ↔ one agent process | **ACP**  | `initialize`, `session/*`, `session/update`, permissions, FS/terminal client RPCs |

Official stance: “AHP is a coordination layer. ACP is a communication layer. They compose naturally.” Host = mutex over ACP ([AHP ↔ ACP guide](https://microsoft.github.io/agent-host-protocol/guide/ahp-and-acp.html)).

ACP itself assumes **one client boots one agent subprocess** and talks over **stdio** (JSON-RPC newline-delimited). One connection supports several concurrent sessions, but the architecture is still point-to-point — not N editors on one stdio pipe ([ACP architecture](https://agentclientprotocol.com/get-started/architecture.md), [ACP transports](https://agentclientprotocol.com/protocol/v1/transports.md)). Sharing one live ACP agent across multiple IDE processes **requires a multiplexer** (exactly what an AHP host — or any custom host — provides).

### Where agent subprocesses live today

This repo’s desktop **Agent Harness** (`apps/desktop/CONTEXT.md`) already is an ACP **Client**:

- Spawns ACP adapter subprocesses (`codex-acp`, `claude-agent-acp`, …) via Host services / Tauri.
- Owns Backend Harness bootstrap, `session/list` roster, session snapshots/transcripts, permissions/elicitations.
- Harness UI is a React consumer of Effect Atom state — does not speak ACP on the wire itself.

`@lib/effect-acp` is the ACP client stack. Issue #65 moves that harness into a shared package and injects portable Host services so the **VS Code webview** can run the same atoms, with the extension host fulfilling spawn/FS over `postMessage` — still **webview-owned**, lifetime = webview.

### Does AHP wrap existing ACP adapters?

**Yes, in principle:** the guide’s composition path is Client → AHP → Host → ACP `session/prompt` → agent `session/update` → mapper → AHP `chat/*` actions → broadcast. This repo’s Codex/Claude adapters remain ACP Agents; the host becomes the ACP Client instead of (or in addition to) the current Atom harness.

**Cost:** map this product’s session snapshot / chat-item model onto AHP’s SessionState + ChatState + reducers, or abandon the Effect Atom harness as the sync authority. That is a product rewrite of the coordination plane, not a thin adapter.

### ACP sync without a host

ACP does support **cold** cross-client continuity when agents advertise capabilities:

- `session/list` — discover ids ([session list](https://agentclientprotocol.com/protocol/v1/session-list.md))
- `session/load` — restore and **replay** history via `session/update` ([session setup](https://agentclientprotocol.com/protocol/v1/session-setup.md))
- `session/resume` — reconnect without replay (if advertised)

That is **not** live multi-subscriber streaming across two clients on one process. Two UIs each spawning their own adapter get separate ACP connections; they can only converge on agent-persisted session ids after load/resume, not share one in-flight turn’s stdout.

## Fit to the proposed architecture

Proposed idea: `apps/desktop` always-on tray app owns agent children; `apps/vscode` connects over WS; multiple windows share session ids and stay live-synced with desktop UI.

### What matches AHP

| Desired property               | AHP support                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-client live sync         | Yes — subscribe + `serverSeq` broadcast                                                                                               |
| Shared session identity        | Yes — `ahp-session:/<uuid>` / `ahp-chat:/<uuid>` (host-scoped URIs; not the same string as ACP `sessionId` unless the host maps them) |
| Process ownership in one place | Yes — host owns backends                                                                                                              |
| VS Code as thin client         | Yes — AHP client over WS                                                                                                              |
| Tray UX                        | Out of band for AHP; Tauri can host the process                                                                                       |

### Gaps vs this product

1. **No reusable AHP host for Tauri** — implement host + ACP event mapper yourself (or embed/fork VS Code’s agent host — unrealistic).
2. **State model mismatch** — AHP ChatState/turns/drafts/activeClients vs this repo’s Session snapshot / Chat item / Pending interaction atoms (`apps/desktop/CONTEXT.md`). Dual models forever, or throw away Atom-as-authority.
3. **0.x protocol churn (weak under a private client set)** — public AHP peers must negotiate versions and expect breaking minors until 1.0 ([versioning](https://microsoft.github.io/agent-host-protocol/specification/versioning.md)). If the host only serves this repo’s clients, ship them in lockstep and ignore negotiation. Remaining cost is still “we invented/maintained a host that looks like AHP,” not “we must stay compatible with foreign clients.”
4. **VS Code depends on desktop running** — product coupling #65 explicitly avoids (webview can work with only the extension host).
5. **Permission / FS / terminal Client RPCs** — ACP agents call back into the Client. With a remote host, the host must fulfill FS/terminal (or proxy to the focused IDE). Multi-window “which cwd / which workspace fulfills `fs/read_text_file`?” is product design AHP does not solve for you.
6. **Conflicts with #65 product rule** — host-owned harness is explicitly rejected for this epic and “this product direction” (issue #65 body).

### Tray / background with Tauri

Feasible with official Tauri v2 APIs: enable `tray-icon`, `TrayIconBuilder` / JS `TrayIcon`, menu Quit/Show; hide main window on close instead of exiting ([System Tray](https://v2.tauri.app/learn/system-tray/)). Pattern is well-documented; not a research blocker. macOS menu bar vs Windows tray are both covered by the same tray feature.

### VS Code extension patterns for local servers

Language servers (stdio/socket), Copilot-style utility processes, and Continue’s in-extension agent loop are all precedents for “extension talks to a local long-lived process.” Continue’s public docs describe agent/tool loops inside the IDE extension stack rather than a separate AHP-like multi-client host ([Continue agent mode](https://docs.continue.dev/ide-extensions/agent/how-it-works)) — useful as “local orchestration exists,” not as a mandate to adopt AHP.

`apps/vscode` today: Hello World secondary-sidebar webview, adapter materialization ADR, **no** harness/Providers yet ([`apps/vscode/README.md`](../../apps/vscode/README.md), [`extension.ts`](../../apps/vscode/src/extension.ts)).

## Sync options without AHP

Ranked lazy → heavy:

### 1. Cold sync via ACP persistence (lazy)

- Each UI owns its own Backend Harness / children (as #65).
- Persist or rely on agent-side history; other UI calls `session/list` then `session/load` / `session/resume` with the same `sessionId` + `cwd`.
- **Live sync:** no. Mid-turn streaming and pending permissions stay local.
- **Requires desktop?** no.

### 2. Shared filesystem transcript + watch/poll (still lazy)

- Write chat items / roster to a known path under `@lib/ao-home` or project meta; other renders file-watch and rehydrate UI.
- **Live sync:** eventual, lossy for streaming tokens unless you write every chunk (expensive/racy).
- Does not share one ACP process or one permission dialog.

### 3. Thin custom local server (Option C — recommended if sync becomes a must)

- Desktop (or tiny headless daemon) keeps **today’s Effect Atom harness** as authority.
- Expose a minimal WS/JSON-RPC: roster snapshot, session snapshot subscribe, prompt/cancel/permission respond, bootstrap phase.
- Multiple VS Code windows + desktop UI subscribe.
- **vs AHP:** reinvent channels/subscriptions/reconnect — but only the 5–10 ops this product needs; keep Atom types; avoid AHP chat taxonomy. (0.x negotiation is a non-issue under a private client set either way — see Gaps.)
- **Requires desktop (or daemon)?** yes.

### 4. Full AHP host (Option B)

- Only if the goal is **interoperability with VS Code Agent Sessions / other AHP clients**, or you want Microsoft’s reducer/reconcile model as a long-term standard.
- Otherwise overkill: you’d re-implement what the thin server needs _plus_ AHP surface area and mapper.

## Interaction with issue #65

Issue [#65](https://github.com/Harris-Miller/agent-orchestrator/issues/65) (Epic: Shared HostServices Seam):

- **Primary seam:** portable Host services (`ChildProcessSpawner | FileSystem | OS | Path`) into the Atom runtime.
- **Where harness runs:** webview (and desktop WebView) — **not** host-owned harness with a phase DTO mirror.
- **Lifetime:** webview lifetime = session lifetime; `retainContextWhenHidden` for hide/switch; dispose / deactivate kills children. Closing the sidebar ending agents is **intentional**.
- **Explicitly rejected:** host-owned Backend Harness; generic remote Atom registry; `AcpClient` command/event bus — “rejected for this product direction,” not merely deferred for Providers.

**Conflict:** the user’s AHP/tray-host idea **is** host-owned harness + multi-client sync. Shipping it _instead of_ #65 overturns the epic’s product rule. Shipping it _as_ #65 is impossible without rewriting the epic.

**Sequencing that does not fight itself (Option D):**

1. Ship #65 as written → Providers + later chat-for-cwd per window.
2. Leave a clean Host services seam (already the point of #65).
3. If/when multi-render live sync is a real user need, add a **shared host** behind a new epic — prefer thin custom API (C) unless AHP interop is the goal (B).
4. Do **not** invent a remote Atom CRDT in #65; if a host appears later, treat UIs as clients of that host API, not as mirrored Atom graphs over IPC (aligns with #65’s rejection of generic remote registry).

## Options detail

### Option A — Stick with #65 as written

- **Live sync:** no across windows/apps.
- **sessionId sharing:** only via agent persistence + load/resume (cold).
- **Process ownership:** each webview’s harness (extension host spawns for VS Code).
- **Requires desktop:** no.
- **Tray:** irrelevant.
- **#65 conflict:** none — this _is_ #65.

### Option B — Desktop as AHP host, VS Code as AHP clients

- **Live sync:** yes (spec).
- **sessionId sharing:** AHP URIs; map to ACP ids inside host.
- **Process ownership:** desktop/tray host.
- **Requires desktop:** yes (or another always-on AHP server).
- **Tray:** Tauri-capable; host must stay alive when window hidden.
- **#65 conflict:** direct — host-owned harness.
- **Gaps:** build host + mapper; rewrite or dual-stack UI state; FS/permission routing; npm gives client only. (0.x negotiation is moot if only this repo’s clients connect and bump in lockstep.)

### Option C — Simpler custom local server (no AHP)

- **Live sync:** yes if you implement subscribe/push.
- **sessionId sharing:** reuse harness/`sessionId` strings you already have.
- **Process ownership:** desktop or daemon.
- **Requires desktop:** yes (unless daemon is separate binary).
- **vs AHP:** less protocol surface; more “only what we need”; no free interop with VS Code Agent Sessions.
- **#65 conflict:** same host-ownership tension — schedule after #65 (Option D).

### Option D — Hybrid / incremental

- Track A/B of #65 first.
- Seams to leave open: Host services injection; avoid baking “webview is the only possible owner” into non-portable modules; keep ACP client connect API stable (`@lib/effect-acp`); optional later “remote harness client” adapter that speaks WS instead of local spawn — **without** implementing it now.
- When sync is demanded: add C (or B if interop). Until then YAGNI.

## Recommendations

1. **Do not adopt AHP for this product right now.** It validates the _shape_ of the user’s idea (shared host + multi-subscriber sync) but is the expensive, Microsoft-shaped realization of that shape — and it contradicts #65’s chosen lifetime rule.
2. **Ship issue #65 as written (Option A / first half of D).** Providers + webview-owned harness is the correct next increment; `apps/vscode` is still Hello World.
3. **Treat live multi-window sync as a separate product decision.** If the answer is “nice to have,” stay on cold `session/list` + `session/load`. If the answer is “must have,” prefer **Option C** (thin WS over existing harness) over full AHP.
4. **Revisit AHP only if** you want AHP’s _state model_ (channels, reducers, `serverSeq`) as the coordination plane — not because foreign clients need to connect. A private host+client pair still pays for host implementation + ACP event mapper + mapping (or replacing) today’s Atom session/chat types. Prefer Option C unless those AHP primitives are the deliberate bet. Interop with VS Code Agent Sessions / third-party AHP clients would strengthen the AHP case; it is not required for the tray-host idea.
5. **Tray-as-daemon is fine later** (Tauri tray + hide-on-close) whether the protocol is custom or AHP — but make “desktop must be running” an explicit product trade, not an accidental side effect of #65.

## Sources

| Source                                                                                                                                                                                                       | Supported                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| [AHP home](https://microsoft.github.io/agent-host-protocol/)                                                                                                                                                 | Multi-client sync purpose; host between clients and agents; `serverSeq` broadcast                    |
| [AHP spec overview](https://microsoft.github.io/agent-host-protocol/specification/overview.html)                                                                                                             | JSON-RPC; channel routing; schema artifact names                                                     |
| [AHP transport](https://microsoft.github.io/agent-host-protocol/specification/transport.html)                                                                                                                | Transport-agnostic; WS common; VS Code uses WS                                                       |
| [AHP lifecycle](https://microsoft.github.io/agent-host-protocol/specification/lifecycle.html)                                                                                                                | `initialize` / `reconnect` / replay vs snapshot                                                      |
| [AHP channels & subscriptions](https://microsoft.github.io/agent-host-protocol/specification/subscriptions.html)                                                                                             | URI schemes; subscribe snapshots; multi-subscriber action delivery; `activeClients` in example state |
| [AHP root / session / chat channels](https://microsoft.github.io/agent-host-protocol/specification/root-channel.html)                                                                                        | Catalogue events; session/chat lifecycle; Stability 2                                                |
| [AHP ↔ ACP guide](https://microsoft.github.io/agent-host-protocol/guide/ahp-and-acp.html)                                                                                                                    | Complementary layers; host as ACP client + event mapper; when to use which                           |
| [AHP versioning](https://microsoft.github.io/agent-host-protocol/specification/versioning.md)                                                                                                                | Stability index; 0.x compatibility rules                                                             |
| [microsoft/agent-host-protocol README](https://github.com/microsoft/agent-host-protocol)                                                                                                                     | Client SDKs; reference host = VS Code; pi-ahp; no Tauri host package                                 |
| [Spec release spec/v0.9.0](https://github.com/microsoft/agent-host-protocol/releases/tag/spec%2Fv0.9.0)                                                                                                      | Schema zip assets; current published spec                                                            |
| [@microsoft/agent-host-protocol](https://www.npmjs.com/package/@microsoft/agent-host-protocol) / [TS client README](https://github.com/microsoft/agent-host-protocol/blob/main/clients/typescript/README.md) | Client-only npm surface (`/client`, `/ws`, `/hosts`)                                                 |
| [Session state types](https://github.com/microsoft/agent-host-protocol/blob/main/types/channels-session/state.ts)                                                                                            | `activeClients` / `SessionActiveClient`                                                              |
| [ACP llms.txt](https://agentclientprotocol.com/llms.txt)                                                                                                                                                     | Index into ACP docs                                                                                  |
| [ACP architecture](https://agentclientprotocol.com/get-started/architecture.md)                                                                                                                              | Client boots agent subprocess; stdio; concurrent sessions on one connection                          |
| [ACP transports](https://agentclientprotocol.com/protocol/v1/transports.md)                                                                                                                                  | stdio normative; custom transports allowed                                                           |
| [ACP session setup](https://agentclientprotocol.com/protocol/v1/session-setup.md)                                                                                                                            | `session/new                                                                                         | load | resume | close`; loadSession capability |
| [ACP session list](https://agentclientprotocol.com/protocol/v1/session-list.md)                                                                                                                              | Discovery of persisted sessions                                                                      |
| [Tauri v2 System Tray](https://v2.tauri.app/learn/system-tray/)                                                                                                                                              | Tray icon / menu; show window on click                                                               |
| [Continue agent mode](https://docs.continue.dev/ide-extensions/agent/how-it-works)                                                                                                                           | Example of IDE-local agent/tool orchestration (not AHP)                                              |
| GitHub issue [#65](https://github.com/Harris-Miller/agent-orchestrator/issues/65)                                                                                                                            | HostServices seam; webview lifetime rule; rejects host-owned harness                                 |
| [`apps/desktop/CONTEXT.md`](../../apps/desktop/CONTEXT.md)                                                                                                                                                   | Agent Harness / Backend Harness / roster / snapshot vocabulary                                       |
| [`apps/vscode/README.md`](../../apps/vscode/README.md)                                                                                                                                                       | Current extension = Hello World + adapter materialization                                            |
| Prior research [`2026-09-17-vscode-extension-development.md`](./2026-09-17-vscode-extension-development.md)                                                                                                  | Local VS Code extension load patterns                                                                |
| Prior ACP research under `docs/research/2026-09-*-acp-*.md`                                                                                                                                                  | Adapter/`_meta` realities for this repo’s ACP path                                                   |
