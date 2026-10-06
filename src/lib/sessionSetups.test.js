import { describe, expect, it } from 'vitest'
import { buildRecentSessionSetups, normalizeSessionTags } from './sessionSetups'

describe('normalizeSessionTags', () => {
  it('cleans and deduplicates tags without changing their display case', () => {
    expect(normalizeSessionTags([' Coding ', 'coding', '', 'Deep work'])).toEqual(['Coding', 'Deep work'])
  })

  it('preserves an explicitly unlimited session setup', () => {
    expect(buildRecentSessionSetups([{
      task: 'Open-ended research',
      goal: 'Follow the evidence',
      plannedDuration: null,
    }])).toEqual([{
      task: 'Open-ended research',
      goal: 'Follow the evidence',
      duration: null,
      tags: [],
    }])
  })

  it('refuses non-array values', () => {
    expect(normalizeSessionTags('Coding')).toEqual([])
  })
})

describe('buildRecentSessionSetups', () => {
  it('builds reusable setups from session history and removes exact duplicates', () => {
    const sessions = [
      { task: 'Draft essay', goal: 'Write 800 words', duration: 60, energyLevel: 'fresh', tags: ['Writing'] },
      { task: ' Draft essay ', goal: 'Write 800 words', duration: 60, energyLevel: 'tired', tags: ['Writing'] },
      { task: 'Read chapter', goal: 'Notes complete', plannedDuration: 30, tags: ['Study'] },
    ]

    expect(buildRecentSessionSetups(sessions)).toEqual([
      { task: 'Draft essay', goal: 'Write 800 words', duration: 60, tags: ['Writing'] },
      { task: 'Read chapter', goal: 'Notes complete', duration: 30, tags: ['Study'] },
    ])
  })

  it('never carries an old energy answer into a reused setup', () => {
    // Energy describes the day it was given. A reused brief that brought it
    // along would store yesterday's "tired" as today's answer.
    const [setup] = buildRecentSessionSetups([
      { task: 'Draft essay', goal: '', duration: 60, energyLevel: 'tired', tags: [] },
    ])
    expect(setup).not.toHaveProperty('energyLevel')
  })

  it('stays silent when history has no named sessions', () => {
    expect(buildRecentSessionSetups([{ goal: 'No task' }, null])).toEqual([])
  })
})
