// The public download: the signed, notarized production release that talks to
// the production beta backend (test-channel builds talk to staging).
//
// The file name follows companion-release.yml's releaseAssetNamePattern
// '[name]-[version]-[arch][ext]'.
//
// The website's download page finds the newest production release on GitHub
// by itself (src/web/latestRelease.js); this pinned release is only its
// fallback when GitHub can't be reached. Bumping it is optional, but keep it
// pointing at a release that exists.
//
// Never fall back to the historical unsigned `latest` release.
export const RELEASE_VERSION = '0.2.0'
export const DOWNLOAD_URL = `https://github.com/clemenssteinbrennercrypto-prog/Eudaimonai/releases/download/release-v${RELEASE_VERSION}/Eudaimonai-${RELEASE_VERSION}-aarch64.dmg`
