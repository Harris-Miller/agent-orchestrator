# Orca vs T3 Code: ACP for Gemini and Antigravity

Date: 2026-10-29  
Question: How do the local OSS checkouts of **orca** and **t3code** handle Agent Client Protocol (ACP) specifically for **Gemini** (Gemini CLI / gemini ACP) and **Antigravity** (Google Antigravity / `agy` / `agy_acp_server`)?

Primary sources (read in tree, not blogs):

- `/Users/harris/Projects/github_oss_projects/orca`
- `/Users/harris/Projects/github_oss_projects/t3code`

## Summary

| Product | Gemini | Antigravity |
| --- | --- | --- |
| **orca** | Present as a **TUI** agent (`gemini` binary). **Not** an ACP launch spec / structured ACP chat. | Dual: TUI via `agy`, **and** first-class **ACP** via managed `agy_acp_server.par` (pinned **1.3.0**, no Windows pin). |
| **t3code** | **No** first-party `gemini` provider driver. Gemini CLI is addable only as a generic **ACP Registry** agent (`agentId: "gemini"`, e.g. `@google/gemini-cli`). First-party Google path is Antigravity. | First-party ACP provider (`driverKind: "antigravity"`), managed `agy_acp_server` **1.4.1**, multi-instance profiles under `GEMINI_HOME`. |

Both projects treat Antigravity ACP as Google’s official `antigravity-acp` server (stdio JSON-RPC), not the interactive `agy` TUI. Neither injects non-empty `mcpServers` into Antigravity `session/new` in the paths inspected (both pass `[]`).

---

## Method

Grep/read both trees for `acp`, `gemini`, `antigravity`, `agy_acp`, `session/new`, `initialize`, `@agentclientprotocol`, launch/spawn env. Claims below cite concrete paths (line ranges when quoting behavior).

---

## Orca

### Agents that speak ACP (structured chat)

Orca’s ACP launch table is explicit. Registered ACP agents are **not** Gemini:

```346:352:/Users/harris/Projects/github_oss_projects/orca/src/main/acp/acp-launch-specs.ts
export const ACP_LAUNCH_SPECS: readonly AcpLaunchSpec[] = [
  GROK_LAUNCH_SPEC,
  OPENCODE_LAUNCH_SPEC,
  OPENCODE2_LAUNCH_SPEC,
  OMP_LAUNCH_SPEC,
  ANTIGRAVITY_LAUNCH_SPEC
]
```

Runtime registration test lists structured agents including Antigravity, excluding Gemini:

```10:13:/Users/harris/Projects/github_oss_projects/orca/src/main/runtime/structured-agent-runtime-registrations-acp.test.ts
  it('registers Grok beside Claude and Codex with its declared capabilities', () => {
    expect(
      STRUCTURED_AGENT_RUNTIME_REGISTRATIONS.map(({ definition }) => definition.agent)
    ).toEqual(['pi', 'codex', 'claude', 'grok', 'opencode', 'opencode2', 'omp', 'antigravity'])
```

(`pi` / `codex` / `claude` are structured via other adapters; ACP-lane rows come from `ACP_LAUNCH_SPECS` in `structured-agent-runtime-metadata.ts` ~115–118.)

### Gemini in Orca — TUI only (no ACP)

Gemini is a known **TUI** agent id with `detectCmd: 'gemini'`:

```174:177:/Users/harris/Projects/github_oss_projects/orca/src/shared/tui-agent-config.ts
  gemini: {
    detectCmd: 'gemini',
    promptInjectionMode: 'flag-prompt-interactive'
  },
```

Union comment: `'gemini' // Gemini CLI` (`src/shared/tui-agent.ts` ~17). Related non-ACP surfaces: terminal title glyphs, AI Vault session scanners under `src/main/gemini/` and `session-scanner-gemini-parsers.ts`, permission default `--yolo` (`tui-agent-permissions.ts`).

**Evidence of no Gemini ACP:** `gemini` never appears in `ACP_LAUNCH_SPECS` / ACP registration list above. No `src/main/gemini/*acp*` launch runtime analogous to `src/main/antigravity/antigravity-acp-runtime.ts`.

### Antigravity in Orca — TUI + ACP

**TUI path:** `detectCmd: 'agy'`, paste/trust quirks (`tui-agent-config.ts` ~178–188). Separate from ACP chats; comments say `agy` has **no ACP mode**.

**ACP path:** managed Google download of `agy_acp_server`, not PATH `agy`:

```306:343:/Users/harris/Projects/github_oss_projects/orca/src/main/acp/acp-launch-specs.ts
// Google's Antigravity ACP server, which Orca installs (the `agy` CLI has no ACP mode). Its chats
// sign in to a folder of their own on each host; an `agy` login is not theirs.
export const ANTIGRAVITY_LAUNCH_SPEC = {
  agent: 'antigravity',
  command: ANTIGRAVITY_ACP_COMMAND,
  ignoreAgentCommandSetting: true,
  // The registry's Linux launch: without `--uid=` the server, started as root, drops to nobody.
  args: () => (process.platform === 'linux' ? ['--uid='] : []),
  env: ANTIGRAVITY_ACP_ENV,
  scrubEnvironment: scrubAntigravityAcpEnvironment,
  dialect: ANTIGRAVITY_ACP_DIALECT,
  ...
  authMethod: ({ advertised }) =>
    advertised.includes('oauth-personal') ? 'oauth-personal' : undefined,
  ...
  managedRuntime: ANTIGRAVITY_ACP_RUNTIME,
  permissionModeConfig: {
    values: { ask: 'default', 'accept-edits': 'auto_edit', 'full-access': 'yolo' }
  },
  imagePrompts: true,
  modelDiscovery: {
    kind: 'unavailable',
    reason: 'the Antigravity server lists its models only in a signed-in session'
  },
  ...
  resumePreference: 'resume',
  launchGate: ANTIGRAVITY_LAUNCH_GATE
} satisfies AcpLaunchSpec
```

#### Registration / command / env / cwd / discovery

| Concern | Behavior | Source |
| --- | --- | --- |
| Command | `agy_acp_server.par` (`ANTIGRAVITY_ACP_COMMAND`) | `antigravity-acp-runtime.ts` ~80–87 |
| Install | Pinned zip from `dl.google.com/agy-extensions/releases`, version **1.3.0**; hashes for darwin/linux arm64+x64; **`pin()` returns null on Windows** | `antigravity-acp-runtime.ts` ~9–77 |
| Args | Linux: `['--uid=']`; else `[]` | `acp-launch-specs.ts` ~312–313 |
| Env forced | `AGY_ACP_FORCE_FILE_STORAGE=1`, custom `BROWSER` helper, `PYTHONUNBUFFERED=1` | `antigravity-acp-environment.ts` ~9–13 |
| Env scrubbed | Drops `GEMINI_API_KEY`, `ANTIGRAVITY_HARNESS_PATH`, `GCLOUD_PROJECT`, `CLOUDSDK_CORE_PROJECT`, `GOOGLE_*`, other `AGY_ACP_*` | `antigravity-acp-environment.ts` ~16–34; test `acp-structured-antigravity.test.ts` ~83–106 |
| Account / cwd home | Host folder binding `GEMINI_HOME` → `…/antigravity-chat` (+ `antigravity-acp` subdir mode 0700) | `antigravity-chat-account.ts` ~14; test ~107–112 |
| Model discovery | Declared **unavailable** until signed-in session | `acp-launch-specs.ts` ~334–337 |
| Command override | `ignoreAgentCommandSetting: true` so UI `agy` override does not replace ACP server binary | `acp-launch-specs.ts` ~310–311; test expects command still `ANTIGRAVITY.command` even with `agentCmdOverrides.antigravity` |

Probe validates install by spawning the server under throwaway `GEMINI_HOME` and calling **`initialize` only** (no session / no sign-in): expects `agentInfo.name === 'antigravity-acp'`, matching version, `protocolVersion === 1`, `loadSession`, `resume`, `auth.logout`, `oauth-personal` (`antigravity-acp-runtime-probe.ts` ~15–51).

#### ACP session start (transport, initialize, session/new)

Transport: **stdio** — `createAcpAgentConnection` spawns a managed provider process and wraps stdout/stdin in `AcpSessionRuntime` (`acp-agent-connection.ts` ~37–100; `acp-structured-connection.ts` comments ~1–3).

Handshake (`acp-structured-handshake.ts` ~48–97):

1. `connection.initialize()`
2. Optional `authMethodId` from launch spec
3. Resume: `connection.start({ cwd, mcpServers: [], sessionId, … })` → load/resume per setup
4. Else: `connection.start({ cwd, mcpServers: [], … })` → **`session/new`**
5. Antigravity: set permission mode via config option after start

`initialize` payload uses protocol version constant **1** and fs/terminal client caps off (`acp-session-runtime.ts` ~103–111; `ACP_PROTOCOL_VERSION = 1` in `generated/acp-protocol.generated.ts` ~200).

`setupAcpSession` (`acp-session-setup.ts` ~34–63): no `sessionId` → `session/new`; with id → prefer `session/load` unless `resumePreference === 'resume'` and resume advertised → then `session/resume`. Antigravity sets `resumePreference: 'resume'` explicitly (avoids full replay via `session/load`).

Auth: on auth-required, authenticate with advertised method then retry setup (`acp-session-setup.ts` ~64–84). Spec selects `oauth-personal` when advertised (`acp-launch-specs.ts` ~318–320). Sign-in URL captured via `BROWSER` helper printing a marker line (`antigravity-browser-helper.ts`).

#### Antigravity-specific dialect / quirks

`ANTIGRAVITY_ACP_DIALECT` (`acp-dialects/antigravity-dialect.ts`):

- Questions arrive as `session/request_permission` on `interaction_*` tool calls (including in yolo); must pick one offered option (no free text).
- “Allow Always” may carry `_meta['agy.security.warning']`.
- Normalizes execute tool `rawInput`/`rawOutput` field naming (`command_line` / `combinedOutput` etc.).
- Withholds `logout` command from chat (host-shared sign-out).

Fixture `acp/fixtures/antigravity-v1-question.jsonl` records initialize with auth methods `oauth-personal`, `oauth-business`, `gemini-api-key`, `agent-platform`, and `agentInfo.name: "antigravity-acp"`.

MCP: handshake always passes **`mcpServers: []`** (no injection). System-prompt injection: no Antigravity-specific system prompt path found under ACP structured prompts for this agent (generic ACP prompt path; not Gemini/Antigravity-specialized in the files searched).

---

## T3 Code

### Provider model

First-party providers live in `providerClients`; Antigravity is first-class and claims registry id `antigravity-acp` (hidden from Registry UI search). There is **no** first-party `gemini` / `gemini-cli` client entry:

```18:47:/Users/harris/Projects/github_oss_projects/t3code/packages/client-runtime/src/providerClients.ts
export const providerClients = makeProviderClientRegistry([
  { driverKind: … "codex", … acpRegistryAgentIds: ["codex-acp"], … },
  { driverKind: … "claudeAgent", … acpRegistryAgentIds: ["claude-acp"], … },
  cursorClient,
  grokClient,
  …
  {
    driverKind: ProviderDriverKind.make("antigravity"),
    label: "Antigravity",
    modelFamilies: ["Gemini "],
    acpRegistryAgentIds: ["antigravity-acp"],
    settingsSchema: AntigravitySettings,
  },
  …
  acpRegistryClient,
]);
```

Registry search filters out first-class registry agent ids (`AcpRegistrySearchStep.tsx` ~38–40, ~153), so **`antigravity-acp` does not appear** as an addable Registry agent; users enable Antigravity under Providers. Docs: `docs/user/providers-acp.md` ~8–10; `docs/user/providers-antigravity.md`.

### Gemini in T3 Code — Registry ACP only (not first-party)

Evidence Gemini CLI is handled as a **generic ACP Registry** agent:

- UI/tests use `agentId: "gemini"`, package `@google/gemini-cli@…`, instance ids like `acpRegistry_gemini` (`AcpRegistrySupport.test.ts` ~1608–1634; `AcpRegistrySearchStep.browser.test.tsx` ~52–83).
- `AcpRegistryAdapterV2.test.ts` references `agentId: "gemini"` for generic launch/steering (~971, ~1039).
- User docs list Antigravity as the Google first-party provider; ACP Registry is the path for other agents (`providers-acp.md`). No `docs/user/providers-gemini.md`.

Registry launch is data-driven from the official registry entry (binary / npx / uvx args+env from agent JSON) — `resolveAcpRegistryDistribution` (`AcpRegistrySupport.ts` ~419–457). Tests often show spawn args like `--stdio` for registry agents generally; **exact Gemini CLI argv comes from the live registry entry**, not a hard-coded Gemini driver in-tree.

Shared ACP runtime notes **gemini-cli** as an ACP v1 agent that may only advertise `modes` and needs `session/set_mode` instead of v2 mode config options (`AcpSessionRuntime.ts` ~2611–2613). That is a generic adapter quirk for gemini-cli-shaped agents, not a dedicated Gemini provider module.

**Verdict:** T3 does **not** ship a dedicated Gemini ACP driver. Gemini ACP = add Registry agent `gemini` (or a local ACP command). Product “Google / Gemini models” for first-party chat is **Antigravity**.

### Antigravity in T3 Code — first-party ACP driver

User-facing: `docs/user/providers-antigravity.md` — “Google's official Antigravity ACP agent”; sign-in separate from Antigravity IDE/CLI; registry link to `antigravity-acp/agent.json`.

#### Registration / command / args / env / discovery

| Concern | Behavior | Source |
| --- | --- | --- |
| Driver | `AntigravityDriver` (`driverKind: "antigravity"`) | `Drivers/AntigravityDriver.ts` |
| Executable | Managed install of `agy_acp_server.par` / `.exe` + `localharness_external`; version pin **1.4.1**; Windows included | `antigravityRelease.ts` ~1–86; `AntigravityInstallation.ts` |
| Spawn | `command: executablePath`, Linux args `["--uid="]`, else `[]`; `extendEnv: false` | `buildAntigravityAcpSpawnInput` `antigravityAuthSupport.ts` ~422–447 |
| Env | Private `GEMINI_HOME` = profile dir; `AGY_ACP_FORCE_FILE_STORAGE=1`; `BROWSER` = Node helper; `PYTHONUNBUFFERED=1`; `ELECTRON_RUN_AS_NODE=1`; temp dirs; optional `GEMINI_API_KEY` / `GOOGLE_API_KEY` from **settings auth**, not ambient; sets `ANTIGRAVITY_HARNESS_PATH` | `antigravityEnvironment` ~194–230; spawn ~437–445; internals `docs/internals/providers.md` ~39–44 |
| Profiles | Per-instance hashed dirs under `providers/antigravity/<sha256(instanceId)>` | `resolveAntigravityInstanceDirectories` ~180–187 |
| Skills | Symlink profile skill dirs to real `~/.gemini` skill paths | `linkAntigravityUserSkills` ~233–269 |
| Settings | `authMethod` (`oauth-personal` / `oauth-business` / `gemini-api-key` / `agent-platform`), api key, GCP project/location, optional `binaryPath` | `contracts/src/settings.ts` ~776–850 |

Validate install: spawn + `initialize`; require `agentInfo.name === "antigravity-acp"`, expected version, protocol 1 or 2, `loadSession`, etc. (`AntigravityInstallation.ts` ~402–408).

#### ACP session start

`makeAntigravityAcpRuntime` wraps shared `AcpSessionRuntime.layer` (`AntigravityAcpSupport.ts` ~46–81):

- `authMethodId`: settings method (default `oauth-personal`)
- **`authenticateEagerly: true`** — authenticate **before** session open (comment: Antigravity selects credential source from method; may accept methods not listed in initialize — `AcpSessionRuntime.ts` ~2211–2213)
- `resumeMethod: "resume"`
- `cancelBehavior: "wait-for-prompt"`
- **`clientInfo: { name: "zed", version: "0.0.0" }`** — “agent offers non-Gemini models only to allowlisted clients such as Zed”
- Client caps: optional `readTextFile`, `writeTextFile: false`, `terminal: false`
- Stdout/stderr transforms for Google auth URL capture
- `transformSessionUpdate: normalizeAntigravitySessionUpdate`

Shared start sequence (`AcpSessionRuntime.ts` ~2040–2205):

1. Connect / spawn child (stdio)
2. `initialize` with **`protocolVersion: 2`** (negotiates; Antigravity fixtures also show v2 — `effect-acp/test/fixtures/antigravity-initialize.json`)
3. Eager `authenticate` when configured
4. `session/new` (or `session/resume` / `session/load` when resuming) with `cwd` + `mcpServers` from options

Antigravity driver passes **`mcpServers: []`** for setup/catalog runtimes (`AntigravityDriver.ts` ~299, ~454). Tests assert `session/new` mcpServers empty (`AntigravityDriver.test.ts` ~315–330).

Permission modes map to Antigravity config values `default` / `auto_edit` / `yolo` (`antigravityPermissionMode` in `AntigravityAcpSupport.ts` ~83–92). Model id `antigravity-default` is a T3 marker never sent as a real ACP model (`contracts/src/model.ts` ~134–135).

#### Quirks / workarounds (Antigravity)

- Profile isolation + scrub ambient Google creds (`docs/internals/providers.md` ~39–44).
- Auth URL may appear as large stderr/stdout line (16 KiB noted in `AcpSessionRuntime.ts` ~84–85); parsed as Google OAuth URL (`parseAntigravityAuthorizationUrl`).
- Remote sign-in: loopback `127.0.0.1` callback pasted back into T3 (`providers-antigravity.md` ~19–33).
- MCP result truncation / summary replacement called out in provider-core / adapter comments (`McpProviderSessions.ts` ~15; `adapter.ts` ~3703).
- Thinking level: runtime 1.4 separate config category vs 1.3 encoded in model id (`AntigravityAcpSupport.ts` ~103–123).
- Subagents batched; no per-child control (`providers-antigravity.md` ~105–109).
- Creates empty `.gemini/skills` and `.agents/skills` in workspace on session start (docs).

---

## Comparison

| Topic | Orca | T3 Code |
| --- | --- | --- |
| **Gemini ACP** | **No** — Gemini is TUI (`gemini` CLI) only | **No first-party driver** — optional ACP Registry agent `gemini` / `@google/gemini-cli` |
| **Antigravity ACP** | Yes — managed `agy_acp_server` **1.3.0** (darwin/linux; no Windows pin) | Yes — managed **1.4.1** including Windows |
| **Antigravity TUI** | Yes (`agy`) alongside ACP | Product path is ACP; IDE/CLI mentioned as separate sign-in stores |
| **Spawn** | stdio child; Linux `--uid=` | Same pattern; also sets `ANTIGRAVITY_HARNESS_PATH` |
| **Home** | Shared host `GEMINI_HOME` folder `antigravity-chat` | Per-instance hashed profile as `GEMINI_HOME` |
| **Auth** | Prefer `oauth-personal` after auth-required; BROWSER helper | Eager authenticate with configured method (incl. API key / Vertex); BROWSER helper + remote callback UX |
| **Protocol init** | Client sends ACP **v1** (`ACP_PROTOCOL_VERSION = 1`) | Client prefers **v2** initialize; accepts agent 1/2 |
| **clientInfo quirk** | Default / unspecified in Antigravity path reviewed | Spoofs **`zed`** to unlock non-Gemini models |
| **mcpServers on session/new** | Always `[]` in handshake | `[]` for Antigravity driver sessions |
| **Resume** | Prefer `session/resume` | Prefer `session/resume` |
| **Dialect** | Dedicated `ANTIGRAVITY_ACP_DIALECT` (questions, warnings, tool normalize) | `normalizeAntigravitySessionUpdate` + permission/model helpers in Antigravity ACP support |
| **Model catalog** | Unavailable until signed-in session | From signed-in session config options / account catalog |

Shared design ideas (independently implemented): force file credential storage (`AGY_ACP_FORCE_FILE_STORAGE`), scrub/override ambient Google env, private temp, Linux `--uid=`, capture OAuth URL via fake `BROWSER`, treat `agy` CLI login as **not** the ACP chat account.

---

## Explicit negatives

1. **Orca does not implement Gemini over ACP.** Gemini exists only as a terminal agent; ACP agents are pi/codex/claude/grok/opencode/opencode2/omp/antigravity (structured registration list).
2. **T3 Code does not implement a first-party Gemini ACP provider.** Gemini CLI appears only via ACP Registry / local ACP command; first-party Google integration is Antigravity.
3. Exact live Registry argv for Gemini CLI is **not hard-coded** in the T3 trees searched; it is resolved from the registry agent’s `distribution` at prepare/install time. Do not invent flags beyond test fixtures using `@google/gemini-cli` receipts.
