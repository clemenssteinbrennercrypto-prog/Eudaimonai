import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { NewRecordNote, PersonalRecordsPanel } from './PersonalRecords'

const html = element => renderToString(element).replaceAll('<!-- -->', '')

describe('NewRecordNote', () => {
  it('names the record with its previous best, without emoji', () => {
    const out = html(<NewRecordNote records={[{ key: 'longestBlock', label: 'Longest Deep Focus block', value: 1500, previous: 1140 }]} />)
    expect(out).toContain('New personal record')
    expect(out).toContain('Longest Deep Focus block')
    expect(out).toContain('25m')
    expect(out).toContain('previous best 19m')
    expect(out).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('renders nothing without a record', () => {
    expect(html(<NewRecordNote records={[]} />)).toBe('')
  })
})

describe('PersonalRecordsPanel', () => {
  it('shows progress towards the 10 sessions records need', () => {
    const out = html(<PersonalRecordsPanel sessions={[]} />)
    expect(out).toContain('0 of 10')
    expect(out).toContain('Records start after 10 measured sessions')
  })
})
