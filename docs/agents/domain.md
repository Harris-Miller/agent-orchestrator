# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout for this repo

**Multi-context.** Root `GLOSSARY-MAP.md` indexes per-package glossaries; each package under `apps/*` and `libs/*` may have its own `GLOSSARY.md` and `docs/adr/`. System-wide decisions live in `docs/adr/` at the repo root.

## Before exploring, read these

- **`GLOSSARY-MAP.md`** at the repo root: indexes one `GLOSSARY.md` per package under `apps/*` and `libs/*`. Read each glossary relevant to the topic.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. In multi-context repos, also check `<package>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (this repo):

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← system-wide decisions
├── apps/
│   └── desktop/
│       ├── GLOSSARY.md
│       └── docs/adr/                  ← context-specific decisions
└── libs/
    └── effect-acp/
        ├── GLOSSARY.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

When a glossary term names state held on a domain object (for example a flag on a session snapshot), use the glossary term's camelCase form for the property name in code (`Pending client request` → `pendingClientRequest`). Do not use synonyms listed under `_Avoid_`.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
