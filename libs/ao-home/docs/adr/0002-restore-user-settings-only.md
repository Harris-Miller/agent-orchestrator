# Restore rewrites User settings only

Restoring product defaults rewrites `settings.json` (User settings) only — e.g. `writeUserSettings(defaultSettings)`. It does not delete or rewrite other Agent Orchestrator home artifacts (provider config catalog documents, adapter roster documents, session directories / session usage documents, and later siblings). Those are system or adapter-owned state, not user prefs cleared by Restore defaults.
