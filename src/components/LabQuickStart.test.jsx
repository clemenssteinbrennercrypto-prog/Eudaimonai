/** @vitest-environment jsdom */
import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import LabQuickStart from './LabQuickStart'

afterEach(cleanup)
const ready = { state: 'ready' }

describe('LabQuickStart', () => {
  it('does not start without a task', () => {
    const onStart = vi.fn()
    render(<LabQuickStart protection={ready} onStart={onStart} onEditProtection={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(onStart).not.toHaveBeenCalled()
  })

  it('starts with the typed task and chosen length on Enter', () => {
    const onStart = vi.fn()
    render(<LabQuickStart protection={ready} defaultDuration={30} onStart={onStart} onEditProtection={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'What will you work on?' }), { target: { value: '  Write the intro  ' } })
    fireEvent.click(screen.getByRole('button', { name: '1h' }))
    fireEvent.submit(screen.getByRole('textbox').closest('form'))
    expect(onStart).toHaveBeenCalledWith({ task: 'Write the intro', duration: 60 })
  })

  it('supports a session without a time limit', () => {
    const onStart = vi.fn()
    render(<LabQuickStart protection={ready} onStart={onStart} onEditProtection={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Read' } })
    fireEvent.click(screen.getByRole('button', { name: 'No limit' }))
    fireEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(onStart).toHaveBeenCalledWith({ task: 'Read', duration: null })
  })

  it('asks the same Protection question as the planning screen when not ready', () => {
    const onStart = vi.fn()
    const onEditProtection = vi.fn()
    render(<LabQuickStart protection={{ state: 'empty' }} onStart={onStart} onEditProtection={onEditProtection} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Code' } })
    fireEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Start without active Protection?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue without Protection' }))
    expect(onStart).toHaveBeenCalledWith({ task: 'Code', duration: 30 })
  })

  it('falls back to 30 minutes when the remembered length is not offered', () => {
    const onStart = vi.fn()
    render(<LabQuickStart protection={ready} defaultDuration={90} onStart={onStart} onEditProtection={vi.fn()} />)
    expect(screen.getByRole('button', { name: '30m' })).toHaveAttribute('aria-pressed', 'true')
  })
})
