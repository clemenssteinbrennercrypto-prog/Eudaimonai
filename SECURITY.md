# Security policy

## Supported versions

Security fixes are applied to the newest signed Eudaimonai build. Historical
release assets and locally built versions are not supported.

## Report a vulnerability

Please use GitHub's **Report a vulnerability** button in the Security tab to
open a private security advisory. Do not include exploit details, credentials,
private user data, or undisclosed vulnerabilities in a public issue.

Include the affected app version, macOS version, reproduction steps, expected
impact, and whether the issue requires local access. We will acknowledge a
complete report as soon as practical and coordinate disclosure after a signed
fix is available.

## Product security boundary

- Camera frames and session records are processed locally.
- The app contacts GitHub Releases for signed updates.
- Model credentials are stored in macOS Keychain and used by the native layer.
- Website blocking uses a narrowly scoped root-owned helper. Reports involving
  that helper, the updater, code signing, or release workflows are high priority.

## Audited exceptions

Target-specific dependency findings are never silently suppressed. Any accepted
exception must record its target evidence, scope, owner, and removal condition in
[`docs/security-advisory-exceptions.md`](docs/security-advisory-exceptions.md).
