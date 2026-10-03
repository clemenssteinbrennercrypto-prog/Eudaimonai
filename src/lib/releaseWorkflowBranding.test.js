import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  new URL('../../.github/workflows/companion-release.yml', import.meta.url),
  'utf8',
)

describe('production release branding', () => {
  it('publishes the canonical product name in release-facing copy', () => {
    expect(workflow).toContain("releaseName: 'Eudaimonai v__VERSION__'")
    expect(workflow).toContain('install Eudaimonai.')
    expect(workflow).not.toContain("releaseName: 'Eudonomia")
    expect(workflow).not.toContain('install Eudonomia.')
  })

  it('keeps write access scoped to release jobs', () => {
    expect(workflow).toMatch(/permissions:\n  contents: read\n\njobs:/)
    expect(workflow).toMatch(/release:\n    permissions:\n      contents: write/)
    expect(workflow).toMatch(/publish:[\s\S]*?permissions:\n      contents: write/)
  })
})
