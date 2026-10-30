# @libs/effect-acp

Effect library for the [Agent Client Protocol](https://agentclientprotocol.com/) (ACP): typed RPC over newline-delimited JSON-RPC on a child-process stdio duplex.

Provides the schema, transport, and connection lifecycle used to act as an ACP **Client** — spawning an Agent subprocess, calling `initialize`/`session/*`, and handling Agent-initiated requests. Used by [`@apps/desktop`](../../apps/desktop)'s Agent Harness.

See [`GLOSSARY.md`](./GLOSSARY.md) for the domain glossary and [`docs/adr/`](./docs/adr/) for architecture decisions.

## Exports

- `AcpConnection` — connect to and drive an ACP Agent subprocess
- `AcpSchema` — Effect `Schema` definitions for ACP wire types
- `AcpTransport` — newline-delimited JSON-RPC transport over stdio

## Scripts

```sh
pnpm --filter=@libs/effect-acp test
pnpm --filter=@libs/effect-acp typecheck
```
