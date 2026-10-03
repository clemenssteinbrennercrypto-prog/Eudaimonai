# Contributing

Eudaimonai is currently a closed-source product in a publicly visible
repository. Contributions require prior agreement from the owner.

## Change process

1. Create a focused branch from current `main`.
2. Never commit credentials, local databases, camera data, or user exports.
3. Keep one concern per pull request and explain the failure mode it prevents.
4. Run the relevant local gates before opening the pull request:

```bash
npm ci
npm run lint
npm test -- --run
npm run test:coverage
npm run build
npm run refresh:companion-webui
npm run verify:companion-webui
cargo test --manifest-path companion/src-tauri/Cargo.toml
```

5. Merge only after the protected GitHub checks pass. Release-workflow changes
   require review by the repository owner or designated workflow owner.

## Security-sensitive changes

Changes to `.github/workflows/`, `companion/src-tauri/`, signing, update
metadata, the privileged hosts helper, credentials, or persistence require an
explicit security review. Production publication additionally requires the
protected `production-release` environment and its human approval.
