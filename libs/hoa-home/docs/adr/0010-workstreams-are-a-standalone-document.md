# Workstreams are a standalone document

Workstreams live in their own root file `~/.hoa/workstreams.json`, and each Workstream lists the sessions it owns. We did not add a `workstreamId` field to the Tracked sessions records: Workstreams span launch targets and Projects, Tracked sessions are per launch target and keyed by cwd, and a Project that stops being tracked would orphan its sessions' membership invisibly. Same placement rules as [ADR 0007](./0007-projects-replace-tracked-cwds.md): one root file, each change re-reads and applies only that change, an undecodable file is never overwritten.

"At most one Workstream per session" is enforced by the write verbs (adopting removes the session from any other Workstream first), not by the schema.
