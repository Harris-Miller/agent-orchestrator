# Restore rewrites the Settings document only

`restoreSettingsDefaults` resets `settings.json` to product defaults. It does not delete or rewrite other Agent Orchestrator home artifacts (provider config catalog documents, adapter roster documents, session usage, and later siblings). Those are system or adapter-owned state, not user prefs cleared by Restore defaults.
