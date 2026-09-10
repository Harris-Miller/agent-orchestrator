# Effect Schema for the settings document

The settings document contract is an Effect `Schema` in `@lib/ao-home`, not a checked-in `.schema.json`. One source of truth keeps decode/encode native to the Effect stack already used across the repo and avoids dual maintenance between JSON Schema and TypeScript types.
