# Runbook changelog

## 1.0.0 — submission candidate

- Autopass-backed recovery playbooks with creation, validation and deletion.
- Search and category filtering followed by six-playbook pagination.
- Session-local checklist progress and accessible confirmation/error states.
- One-time initialization of genuinely new libraries with 12 bundled guides,
  durable initialization metadata, and duplicate-safe manual sample imports.
- Shared persistent storage for normal development and packaged launches;
  existing libraries are not migrated or reset.
- Graceful Bare worker shutdown, per-window startup handshake, diagnostic logging,
  and explicit connection retry with storage-lock recovery coverage.
- Purple/indigo checklist branding for the sidebar and native application icons.
- Unit, UI, restart/isolation and macOS packaged-executable regression checks.

Verified scope is macOS ARM64 local development and packaged runtime. Signing,
notarization, installers, Windows/Linux runtime and live Pear OTA are unverified.
See README for setup prerequisites and remaining release metadata requirements.
