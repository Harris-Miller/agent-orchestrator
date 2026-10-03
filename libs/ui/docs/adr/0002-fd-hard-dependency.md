# `fd` / `fdfind` is a hard runtime dependency

Directory listing for the cwd picker and composer `@` search uses `fd` (or Debian/Ubuntu `fdfind`) only — no OS `find` / `dir` fallbacks. Bootstrap gates the app behind a PATH probe and install UX (buttons on macOS/Windows; print-only commands on Linux). Rejected alternatives were shipping a sidecar binary or degrading to platform listing CLIs; both add maintenance and diverge from `fd`’s ignore/hidden behavior.
