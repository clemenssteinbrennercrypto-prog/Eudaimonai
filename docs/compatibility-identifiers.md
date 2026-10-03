# Eudaimonai compatibility identifiers

**Eudaimonai** is the only public product name. Historical identifiers remain
internal where changing them would make macOS or the app treat an update as a
different product.

## Intentionally retained

- Bundle identifier: `ai.eudonomia.companion`
- Rust crate/process name: `eudonomia-companion`
- Existing install directory/base display name: `Eudonomia.app`
- Local-storage, extension, Keychain, helper, and `/etc/hosts` marker prefixes
- Build environment variable names beginning with `EUDONOMIA_`
- Native Objective-C and dispatch identifiers using `eudonomia`

These values are persistence or operating-system contracts. Renaming them can
lose access to local sessions, create duplicate applications, reset camera or
automation permissions, orphan privileged helper files, or break updater
continuity.

## User-visible naming

- Website, window title, localized Finder name, release title, installer copy,
  and documentation use **Eudaimonai**.
- The localized `CFBundleDisplayName` remains Eudaimonai while the base
  `Info.plist` value stays `Eudonomia` solely so existing install paths and Dock
  pins remain valid.
- Any new identifier uses `eudaimonai` unless it must interoperate with one of
  the historical contracts above.

This boundary turns the old spellings into documented compatibility debt rather
than an accidental or expanding second brand.
