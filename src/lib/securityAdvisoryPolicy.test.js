import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readText = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('dependency advisory exceptions', () => {
  it('keeps the target-scoped RustSec exception documented and exact', () => {
    const workflow = readText('../../.github/workflows/security.yml')
    const policy = readText('../../docs/security-advisory-exceptions.md')

    expect(workflow).toContain('ignore: RUSTSEC-2024-0429')
    expect(workflow).not.toMatch(/ignore:\s*['"]?\*|continue-on-error:\s*true/)
    expect(policy).toContain('RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g')
    expect(policy).toContain('aarch64-apple-darwin')
    expect(policy).toContain('before adding any Linux build')
  })
})
