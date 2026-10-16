# Virtual session deferred create

Create New Session no longer calls `session/new` immediately. The Harness keeps a single process-lifetime **Virtual session** blob (draft, launch target, Config values, optional Session cwd) and a **Selected** discriminant (`Virtual` | `Session` | unset). First Send runs `session/new` → `applyConfigDiffs` → Materialize → copies draft into the real session → clears Virtual → prompts. Pre-Materialize failure keeps Virtual; Config `stoppedEarly` continues like Handoff. Discarded on restart; not a Roster entry.

## Considered options

- **Immediate `session/new` on Create (previous):** forces cwd + agent before the user has a prompt; Agents menu on every entry point.
- **Persist Virtual across restarts:** nicer resume, but durable draft/config ownership and churn with roster — out of scope.
- **Fork `sendChatItem` for first send:** duplicates prompt path; sibling `materializeVirtualThenSend` then existing send is thinner.
