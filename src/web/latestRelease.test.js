import { describe, expect, it, vi } from 'vitest'
import { PINNED_RELEASE, fetchLatestRelease, pickProductionRelease } from './latestRelease'

const repo = 'https://github.com/clemenssteinbrennercrypto-prog/Eudaimonai/releases/download'
const release = (tag, version, extra = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  assets: [
    { name: `Eudaimonai-${version}-aarch64.dmg`, browser_download_url: `${repo}/${tag}/Eudaimonai-${version}-aarch64.dmg` },
    { name: 'latest.json', browser_download_url: `${repo}/${tag}/latest.json` },
  ],
  ...extra,
})

describe('the download picks the newest production release', () => {
  it('takes the highest release-vX.Y.Z by number, not by text or date', () => {
    const picked = pickProductionRelease([release('release-v0.2.0', '0.2.0'), release('release-v0.10.1', '0.10.1'), release('release-v0.9.0', '0.9.0')])
    expect(picked).toEqual({ version: '0.10.1', url: `${repo}/release-v0.10.1/Eudaimonai-0.10.1-aarch64.dmg`, pinned: false })
  })

  it('never offers the test channel, drafts, prereleases or retired releases', () => {
    const picked = pickProductionRelease([
      { tag_name: 'internal-test', draft: false, prerelease: true, assets: [{ name: 'Eudaimonai-Test.dmg', browser_download_url: `${repo}/internal-test/Eudaimonai-Test.dmg` }] },
      release('release-v0.3.0', '0.3.0', { draft: true }),
      release('release-v0.4.0', '0.4.0', { prerelease: true }),
      { tag_name: 'companion-v0.1.9', draft: true, prerelease: false, assets: [] },
      release('release-v0.2.0', '0.2.0'),
    ])
    expect(picked.version).toBe('0.2.0')
  })

  it('skips a release without its disk image, or one pointing elsewhere', () => {
    const missing = { ...release('release-v0.5.0', '0.5.0'), assets: [] }
    const foreign = release('release-v0.6.0', '0.6.0')
    foreign.assets[0].browser_download_url = 'https://example.com/Eudaimonai-0.6.0-aarch64.dmg'
    expect(pickProductionRelease([missing, foreign])).toBeNull()
    expect(pickProductionRelease(null)).toBeNull()
  })

  it('falls back to nothing when GitHub fails, so the page keeps the pinned release', async () => {
    expect(await fetchLatestRelease({ fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) })).toBeNull()
    expect(await fetchLatestRelease({ fetchImpl: vi.fn().mockResolvedValue({ ok: false }) })).toBeNull()
    const ok = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([release('release-v0.2.1', '0.2.1')]) })
    expect((await fetchLatestRelease({ fetchImpl: ok })).version).toBe('0.2.1')
    expect(PINNED_RELEASE.pinned).toBe(true)
  })
})
