# Restore rewrites User settings only

Restoring product defaults rewrites `settings.json` (User settings) only — e.g. `writeUserSettings(defaultSettings)`. It does not delete or rewrite other HOA home artifacts (Adapter history documents, Provider directories, and later siblings). Those are system or adapter-owned state, not user prefs cleared by Restore defaults.
