import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readConfig(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'))
}

function readText(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

describe('native updater channels', () => {
  it('keeps local and internal builds on the moving main-branch channel', () => {
    const base = readConfig('../../companion/src-tauri/tauri.conf.json')
    const test = readConfig('../../companion/src-tauri/tauri.test.conf.json')
    const internalEndpoint = 'https://github.com/clemenssteinbrennercrypto-prog/Eudaimonai/releases/download/internal-test/latest.json'

    expect(base.plugins.updater.endpoints).toEqual([internalEndpoint])
    expect(test.plugins.updater.endpoints).toEqual([internalEndpoint])
    expect(test.bundle.macOS).toEqual({
      entitlements: './Entitlements.plist',
      hardenedRuntime: true,
    })
  })

  it('keeps signed production releases on the production channel', () => {
    const release = readConfig('../../companion/src-tauri/tauri.release.conf.json')

    expect(release.plugins.updater.endpoints).toEqual([
      'https://github.com/clemenssteinbrennercrypto-prog/Eudaimonai/releases/latest/download/latest.json',
    ])
  })

  it('applies the production endpoint overlay in the signed release workflow', () => {
    const workflow = readText('../../.github/workflows/companion-release.yml')

    expect(workflow).toMatch(
      /args:\s*--target aarch64-apple-darwin --config src-tauri\/tauri\.release\.conf\.json/,
    )
    expect(workflow).toMatch(/publish:[\s\S]*default:\s*false[\s\S]*type:\s*boolean/)
    expect(workflow).toContain("if: steps.release-meta.outputs.publish != 'true'")
    expect(workflow).toContain("if: steps.release-meta.outputs.publish == 'true'")
    expect(workflow).toContain("if: needs.release.outputs.publish == 'true'")
    expect(workflow).toMatch(/environment:\s*\n\s*name:\s*production-release/)

    const verifyIndex = workflow.indexOf('Verify signed and notarized macOS artifacts')
    const publishIndex = workflow.indexOf('Publish verified production release')
    expect(verifyIndex).toBeGreaterThan(-1)
    expect(publishIndex).toBeGreaterThan(verifyIndex)
  })

  it('publishes only signed and notarized internal builds to the friends channel', () => {
    const workflow = readText('../../.github/workflows/companion-test.yml')

    for (const secret of [
      'APPLE_CERTIFICATE',
      'APPLE_CERTIFICATE_PASSWORD',
      'APPLE_SIGNING_IDENTITY',
      'APPLE_ID',
      'APPLE_PASSWORD',
      'APPLE_TEAM_ID',
      'TAURI_SIGNING_PRIVATE_KEY',
    ]) {
      expect(workflow).toContain(`secrets.${secret}`)
    }

    const verifyIndex = workflow.indexOf('Verify signed and notarized internal artifacts')
    const publishIndex = workflow.indexOf('Publish internal updater channel')
    expect(verifyIndex).toBeGreaterThan(-1)
    expect(publishIndex).toBeGreaterThan(verifyIndex)
    expect(workflow).toMatch(/concurrency:[\s\S]*group:\s*companion-test-main[\s\S]*cancel-in-progress:\s*true/)
    expect(workflow).toContain('xcrun stapler validate')
    expect(workflow).toContain('spctl --assess --type open')
    expect(workflow).toContain('verify-tauri-updater-signature.mjs')
    expect(workflow).toContain('Eudaimonai-Test.dmg')
  })
})
