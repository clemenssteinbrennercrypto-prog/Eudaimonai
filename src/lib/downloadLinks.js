// The public download: the signed, notarized production release that talks to
// the production beta backend (test-channel builds talk to staging).
//
// The file name follows companion-release.yml's releaseAssetNamePattern
// '[name]-[version]-[arch][ext]'. It is a prediction until the release is
// published: verify it resolves (HTTP 200) before anyone is invited, and
// update the version here with every production release.
//
// Never fall back to the historical unsigned `latest` release.
export const RELEASE_VERSION = '0.2.0'
export const DOWNLOAD_URL = `https://github.com/clemenssteinbrennercrypto-prog/Eudaimonai/releases/download/release-v${RELEASE_VERSION}/Eudaimonai-${RELEASE_VERSION}-aarch64.dmg`
