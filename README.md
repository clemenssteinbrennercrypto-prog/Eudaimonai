# Eudaimonai — Companion-first Focus Tracker

[![Quality](https://github.com/clemenssteinbrennercrypto-prog/Eudaimonai/actions/workflows/ci.yml/badge.svg)](https://github.com/clemenssteinbrennercrypto-prog/Eudaimonai/actions/workflows/ci.yml)
[![Dependency Security](https://github.com/clemenssteinbrennercrypto-prog/Eudaimonai/actions/workflows/security.yml/badge.svg)](https://github.com/clemenssteinbrennercrypto-prog/Eudaimonai/actions/workflows/security.yml)

Eudaimonai is a native macOS Companion app for focus sessions. The React UI is
bundled into the Companion, while the public website should explain the vision
and route users to the app download.

## Tech Stack

- **Companion:** Tauri macOS app in `companion/`
- **UI:** React + Vite, bundled into `companion/webui`
- **Attention tracking:** native AVFoundation + MediaPipe, scored in the WebView
- **Activity/blocking:** in-process Rust commands and Tauri events
- **Marketing site:** Vercel surface for product explanation and downloads

## Local Development

```bash
npm install
npm run dev
```

Before opening a pull request, run the protected quality baseline:

```bash
npm run lint
npm test -- --run
npm run test:coverage
npm run build
cargo test --manifest-path companion/src-tauri/Cargo.toml
```

Open the Vite development URL for isolated UI iteration only. It is not a
standalone product and native activity, output evidence, helper installation,
and blocking intentionally stay unavailable there. For the actual product
runtime, build/run the Companion from `companion/src-tauri`.

## Native Companion

The Companion is the primary runtime. It hosts the UI, detects the frontmost app
and browser tab via AppleScript, and enforces app/website blocking during a
session.

Supported systems: Apple Silicon Macs (M1 or newer), macOS 11 or newer. Intel
Macs are intentionally unsupported because the native measurement engine is
arm64-only.

```bash
npm run refresh:companion-webui
cd companion/src-tauri
cargo tauri build
```

Native releases are produced by `.github/workflows/companion-release.yml`. The
workflow runs only from `release-v*` tags or manual dispatch, rebuilds
`companion/webui` from the root Vite app, applies the production Tauri overlay,
then signs, notarizes, verifies, and publishes the macOS bundle.

Pushes to `main` use `.github/workflows/companion-test.yml`. That workflow
refreshes and verifies the bundled UI, builds Developer ID signed and notarized
internal macOS artifacts, verifies Gatekeeper acceptance, and publishes a
stable tester DMG plus updater artifacts to the `internal-test` prerelease.
Production downloads and production native updater metadata remain a separate
release channel.

Until a protected production release is approved, the marketing download
buttons point directly at the signed and notarized `internal-test` DMG. They
must not point at GitHub's historical `/releases/latest` release.

The native app displays a small build/version badge. Use it, or inspect
`companion/webui/build-info.json`, to confirm a fresh build contains the commit
or workflow run you expected.

The old browser extension source remains archived in `extension/`, but it is not
built, wired into the app, or a supported product path.

## Compatibility identifiers

The public product name is **Eudaimonai**. A small set of internal identifiers
still uses the historical `eudonomia` or `eudaimonia` spelling so existing
installs keep their data, updater continuity, permissions, Dock pins, and focus
rules. These identifiers are documented in
[`docs/compatibility-identifiers.md`](docs/compatibility-identifiers.md) and
must not be renamed as a cosmetic cleanup.

## Website Deployment (Vercel)

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import this repository from GitHub
3. Vercel auto-detects Vite — no config needed (vercel.json is already set)
4. Click **Deploy**

### Environment Variables

None required for the marketing/download surface. Native activity tracking and
blocking require the Companion runtime.

### Build Settings (auto-detected via vercel.json)

| Setting | Value |
|---|---|
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Framework | Vite |

## Features

- Real-time focus scoring via webcam (PERCLOS, blink rate, head pose)
- Session history with timeline charts
- Flow state detection
- Break reminders
- CSV export
- Dark mode ambient display

## Data safety

Session history is stored locally in the native app's SQLite database. In
Analytics → History → Data tools, **Export full archive (JSON)** creates a
lossless backup including timelines, the focus ledger, workspaces, protection
setups, preferences, and dated workday settings. Machine-specific paths and
credentials are deliberately excluded. **Restore full archive (JSON)** merges only sessions whose IDs are
not already present; it never overwrites existing sessions. The native restore
validates the archive first and commits the new sessions and rebuilt ledger in
one SQLite transaction.

Before replacing or removing an installed app copy, export an archive and keep
it outside the application bundle. Removing an `.app` normally leaves its app
data in place, but the backup is the explicit recovery path and should be
verified before duplicate installations are cleaned up.

## Security and project policy

- Vulnerabilities: [SECURITY.md](SECURITY.md)
- Change process: [CONTRIBUTING.md](CONTRIBUTING.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)
- Detailed engineering invariants: [AGENTS.md](AGENTS.md)

This repository is publicly visible but is **not open source**. See
[LICENSE](LICENSE). Public releases are signed distribution artifacts; source
visibility does not grant reuse rights.
