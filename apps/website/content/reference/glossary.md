# Glossary

The words HOA's UI and these docs use, and what they mean.

## Agent Harness

The part of HOA that spawns agents, negotiates capabilities, runs sessions, and fulfills agents' requests for files, terminals and permission.

## ACP (Agent Client Protocol)

The open JSON-RPC protocol HOA uses to talk to agents over stdio. HOA is the client. See [agentclientprotocol.com](https://agentclientprotocol.com/).

## Agent provider

A coding-agent backend: Codex, Claude, Cursor, Antigravity.

## Launch target

The process HOA spawns for a provider (`codex-acp`, `claude-agent-acp`, `cursor-acp`, `antigravity-acp`).

## Provider runtime

The downloaded program behind a launch target, under `~/.hoa/providers/<launch target>/runtime/`.

## Project

A directory you brought into HOA. Session History groups sessions by Project.

## Session cwd

The directory a session's agent works in. Fixed when the session is created.

## Session History

The list of sessions HOA tracks, grouped by Project.

## Tracked session

A session HOA owns a record of — created in HOA, or imported.

## Import

Choosing existing agent sessions of a Project to track.

## Pin

A mark that shows a session once, in the Pinned section.

## Steering

Sending a message into a turn that is still running.

## Queued message

One message held until the running turn ends, then sent as a new turn.

## Permission request / elicitation

An agent's request for your approval or for a small form; it waits on the session until you answer.

## Config option

A setting the agent reports for a session, such as its model or mode.

## Hub

The local process agents call HOA's tools on (Handoff, subagents). One per machine.

## Handoff

Moving work to another agent through a handoff document the source agent writes.

## Spawned subagent session

A session on another agent that an agent started through the Hub; its result returns to the parent.

## Workstream

A named collection of sessions across Projects and agents (experimental).
