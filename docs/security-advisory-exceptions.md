# Security advisory exceptions

Exceptions in dependency scanning must be narrow, evidenced, and temporary. An
entry does not claim that the affected package is safe; it records why the
package is outside the shipped product's build graph.

## RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g

- **Package:** `glib` 0.18.x
- **Severity:** moderate
- **Affected behavior:** unsound iterator implementations in GTK-rs GLib
- **Locked through:** Tauri's Linux GTK/WebKit dependency graph
- **Shipped target:** `aarch64-apple-darwin` only
- **Evidence:** `cargo tree --target x86_64-unknown-linux-gnu -i glib@0.18.5`
  reaches `glib` through GTK, WebKitGTK, Wry, and Tauri. The same inverse tree is
  empty for the shipped Apple target.
- **Product exposure:** none in the signed macOS application; GTK/GLib is not
  compiled, bundled, or loaded for the Apple target.
- **Owner:** Eudaimonai maintainers
- **Review condition:** review whenever Tauri/Wry changes or Linux distribution
  is proposed.
- **Removal condition:** remove the audit exception as soon as the lockfile no
  longer contains vulnerable GLib versions, or before adding any Linux build.

GitHub's matching Dependabot alert is dismissed as `not_used` only while these
conditions remain true. The RustSec job continues to fail for every other
advisory.
