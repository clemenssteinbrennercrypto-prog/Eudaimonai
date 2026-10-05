import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import WorkspaceManager from './WorkspaceManager'
import { emptyWorkspaceState, migrateLegacyDevices } from '../lib/workspaceStore'

describe('WorkspaceManager', () => {
  it('requires a visual template when no workspace exists', () => {
    const html = renderToStaticMarkup(<WorkspaceManager state={emptyWorkspaceState()} onChange={() => ({ ok: true })} onContinue={() => {}} />)
    expect(html).toContain('Which setup is closest to your desk?')
    expect(html).toContain('Answer a few questions instead')
    for (const title of ['Laptop', 'One display', 'Two displays']) expect(html).toContain(`<strong>${title}</strong>`)
  })

  it('renders a migrated active workspace in the reusable library', () => {
    const state = migrateLegacyDevices([
      { id: 'monitor', type: 'monitor', col: .5, row: .5, role: 'primary_screen' },
      { id: 'camera', type: 'camera', col: .5, row: .1, role: 'neutral' },
    ])
    const html = renderToStaticMarkup(<WorkspaceManager state={state} onChange={() => ({ ok: true })} onContinue={() => {}} />)
    expect(html).toContain('Imported workspace')
    expect(html).toContain('Active')
    expect(html).toContain('class="workspace-card-preview"')
    expect(html).toContain('aria-label="Attention field for Imported workspace with 2 objects"')
    expect(html).toContain('viewBox="0 0 400 260"')
    expect(html).toContain('data-attention-map="true"')
    expect(html).toContain('data-attention-zone="productive"')
    expect(html).toContain('data-workspace-user="true"')
    expect(html).toContain('data-device-type="monitor"')
    expect(html).toContain('data-device-type="camera"')
  })

  it('marks pads and the mouse as focus and the phone as distraction, nothing by fixed zones', () => {
    const state = migrateLegacyDevices([
      { id: 'monitor', type: 'monitor', col: .5, row: .3, role: 'primary_screen' },
      { id: 'camera', type: 'camera', col: .5, row: .1, role: 'neutral' },
      { id: 'pad', type: 'notebook', col: .8, row: .15, role: 'writing_surface' },
      { id: 'mouse', type: 'mouse', col: .7, row: .2, role: 'input_area' },
      { id: 'phone', type: 'phone', col: .2, row: .2, role: 'distraction_device' },
    ])
    const html = renderToStaticMarkup(<WorkspaceManager state={state} onChange={() => ({ ok: true })} onContinue={() => {}} />)
    // monitor, pad and mouse: focus; phone: distraction; camera: no halo
    expect(html.match(/data-attention-zone="focus"/g)).toHaveLength(3)
    expect(html.match(/data-attention-zone="distraction"/g)).toHaveLength(1)
    expect(html).not.toContain('ambiguous')
  })
})
