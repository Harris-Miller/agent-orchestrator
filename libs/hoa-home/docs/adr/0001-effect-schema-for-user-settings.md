# Effect Schema for User settings

The User settings contract is an Effect `Schema` (`UserSettings`) in `@lib/hoa-home`, not a checked-in `.schema.json`. One source of truth keeps decode/encode native to the Effect stack already used across the repo and avoids dual maintenance between JSON Schema and TypeScript types.
