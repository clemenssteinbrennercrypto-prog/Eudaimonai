import { DOWNLOAD_URL, RELEASE_VERSION } from '../lib/downloadLinks'

// The download page links the newest production release on its own, so a new
// app release needs no website change. A production release is one the
// release workflow published for production: tag `release-vX.Y.Z`, neither a
// draft nor a prerelease, carrying `Eudaimonai-X.Y.Z-aarch64.dmg`. That rules
// out the test channel (`internal-test`, which talks to staging) and every
// retired release. If GitHub can't be reached, the pinned release in
// downloadLinks.js stays the link.
const REPO = 'clemenssteinbrennercrypto-prog/Eudaimonai'
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=30`
const TAG = /^release-v(\d+)\.(\d+)\.(\d+)$/

export const PINNED_RELEASE = Object.freeze({ version: RELEASE_VERSION, url: DOWNLOAD_URL, pinned: true })

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

export function pickProductionRelease(releases) {
  if (!Array.isArray(releases)) return null
  let best = null
  for (const release of releases) {
    const match = TAG.exec(release?.tag_name ?? '')
    if (!match || release.draft || release.prerelease) continue
    const parts = match.slice(1).map(Number)
    const version = parts.join('.')
    const asset = (release.assets ?? []).find(item => item?.name === `Eudaimonai-${version}-aarch64.dmg`)
    const url = asset?.browser_download_url
    // Only ever a file of this repository's own release with that tag.
    if (!url || url !== `https://github.com/${REPO}/releases/download/release-v${version}/Eudaimonai-${version}-aarch64.dmg`) continue
    if (!best || compare(parts, best.parts) > 0) best = { parts, version, url }
  }
  return best ? { version: best.version, url: best.url, pinned: false } : null
}

export async function fetchLatestRelease({ fetchImpl = globalThis.fetch, timeoutMs = 4000 } = {}) {
  if (typeof fetchImpl !== 'function') return null
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const response = await fetchImpl(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller?.signal,
    })
    if (!response.ok) return null
    return pickProductionRelease(await response.json())
  } catch {
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}
