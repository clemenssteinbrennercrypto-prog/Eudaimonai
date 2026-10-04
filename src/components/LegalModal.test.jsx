/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import LegalModal from './LegalModal'

afterEach(cleanup)

function html(tab = 'datenschutz') {
  return renderToString(React.createElement(LegalModal, {
    open: true,
    initialTab: tab,
    onClose() {},
  })).replaceAll('<!-- -->', '')
}

describe('legal copy', () => {
  it('shows the full geographic address required by § 5 ECG', () => {
    const output = html('impressum')
    expect(output).toContain('Address: Heinrich-Casper-Gasse 17, 8010 Graz, Austria')
    expect(output).not.toContain('[')
    expect(output).not.toContain('Vienna')
  })

  it('describes the native store and the reachable deletion route', () => {
    const output = html()
    expect(output).toContain('local SQLite database')
    expect(output).toContain('Analytics → Sessions')
    expect(output).toContain('Clear all history')
    expect(output).toContain('window titles')
  })

  it('describes transient camera processing without denying the in-memory frame buffer', () => {
    const output = html()
    expect(output).toContain('briefly processed in memory')
    expect(output).toContain('neither stored permanently nor transmitted')
    expect(output).not.toContain('no video or image data is stored, buffered or transmitted')
  })

  it('exposes the full-screen legal view as a labelled modal with grouped view buttons', () => {
    const output = html()
    expect(output).toContain('role="dialog"')
    expect(output).toContain('aria-modal="true"')
    expect(output).toContain('aria-labelledby=')
    expect(output).toContain('role="group"')
    expect(output).toContain('aria-pressed="true"')
  })

  it('describes update behavior without advertising disabled model providers', () => {
    const output = html()
    expect(output).not.toContain('„Local model“')
    expect(output).not.toContain('„Claude API“')
    expect(output).toContain('roughly every five minutes')
    expect(output).toContain('GitHub Releases')
  })
})

describe('legal modal keyboard behavior', () => {
  it('focuses Back, closes on Escape, and returns focus to the opener', () => {
    const onClose = vi.fn()

    function Harness() {
      const [open, setOpen] = React.useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open legal</button>
          <LegalModal open={open} initialTab="datenschutz" onClose={() => { onClose(); setOpen(false) }} />
        </>
      )
    }

    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open legal' })
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Privacy Policy' })
    expect(within(dialog).getByRole('button', { name: '← Back' })).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('does not reset focus when a parent supplies a new onClose callback', () => {
    const { rerender } = render(<LegalModal open initialTab="datenschutz" onClose={() => {}} />)
    const impressum = screen.getByRole('button', { name: 'Legal Notice' })
    impressum.focus()

    rerender(<LegalModal open initialTab="datenschutz" onClose={() => {}} />)

    expect(screen.getByRole('button', { name: 'Legal Notice' })).toHaveFocus()
  })

  it('wraps Tab and Shift-Tab within the modal controls', () => {
    render(<LegalModal open initialTab="datenschutz" onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const back = within(dialog).getByRole('button', { name: '← Back' })
    const privacy = within(dialog).getByRole('button', { name: 'Privacy Policy' })

    privacy.focus()
    fireEvent.keyDown(privacy, { key: 'Tab' })
    expect(back).toHaveFocus()

    back.focus()
    fireEvent.keyDown(back, { key: 'Tab', shiftKey: true })
    expect(privacy).toHaveFocus()
  })
})
