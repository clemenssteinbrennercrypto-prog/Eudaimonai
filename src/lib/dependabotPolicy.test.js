import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = readFileSync(
  new URL('../../.github/dependabot.yml', import.meta.url),
  'utf8',
)

describe('Dependabot update policy', () => {
  it('updates React and React-DOM together', () => {
    expect(config).toMatch(/groups:\n\s+react-runtime:/)
    expect(config).toMatch(/patterns:\n\s+- react\n\s+- react-dom/)
  })
})
