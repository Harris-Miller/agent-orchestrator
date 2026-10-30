# No Folder classification uses path-segment conventions

No Folder Session History grouping matches vendor projectless/scratch **path segments** (Claude `scratch-workspaces` + `scratch-YYYY-MM-DD-<6hex>` leaf; Codex consecutive `Documents`/`Codex`), not absolute `~/Library/…/scratch-workspaces/` or `~/Documents/Codex/` prefixes after homedir expand. That keeps classification portable (no OS/homedir/`env` dependency) and lets future Agent providers register their own projectless segment shapes the same way.

We accepted the edge cases that follow: rare **false positives** when an unrelated tree reuses those segment shapes (e.g. `/tmp/scratch-workspaces/scratch-…`), and rare **false negatives** under a vendor root that does not match the registered leaf/segment rule (e.g. Claude `scratch-workspaces` without a scratch leaf). Prefer extending the segment registry for a new provider over switching to absolute-prefix matching.

## Considered options

- **Absolute prefix after `homedir`:** matches issue #58 wording literally; couples classification to OS layout and makes custom/relocated vendor roots (and cross-platform paths) awkward to extend.
- **Path-segment conventions (chosen):** slightly looser matching; deliberately open for additional provider rules without rewriting home-rooted prefixes.
