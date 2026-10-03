# Changelog

All notable user-facing changes are recorded here. Versions follow semantic
versioning for production releases. Internal builds use their CI build version
and are not stable product releases.

## Unreleased

### Added

- Lossless full-archive export and merge-only restore with atomic ledger rebuild.
- Automated npm and RustSec dependency scans.
- Required JavaScript lint and core-library coverage gates.

### Security

- Signed and notarized Apple Silicon app and DMG verification.
- Gatekeeper, stapling, architecture, and updater-signature release gates.
- Protected pull-request-only `main` branch and SHA-pinned GitHub Actions.
- Patched `RUSTSEC-2026-0285` and removed known npm advisories.

### Changed

- Canonical product and repository name is Eudaimonai.
- Public download buttons route only to the verified signed beta channel until
  the first approved production release.

## 0.1.10 - 2026-07-16

- Historical pre-hardening production build. Superseded; do not use for new
  installations.
