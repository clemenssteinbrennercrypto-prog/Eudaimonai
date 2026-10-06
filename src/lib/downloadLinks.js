// Until a protected production release exists, the public surface must never
// fall back to the historical unsigned `latest` release. Internal-test is the
// moving, signed/notarized beta channel verified by companion-test.yml.
// Switching this to the first production release is a separate, approved step.
export const DOWNLOAD_URL = 'https://github.com/clemenssteinbrennercrypto-prog/Eudaimonai/releases/download/internal-test/Eudaimonai-Test.dmg'
