/** @vitest-environment jsdom */
import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import DsSelect from './DsSelect'

afterEach(cleanup)

const OPTIONS = [
  { value: 'desk', label: 'Desk' },
  { value: 'laptop', label: 'MacBook Air' },
  { value: 'off', label: 'Unavailable', disabled: true },
]

describe('DsSelect', () => {
  it('shows the current value and opens a listbox with the selection checked', () => {
    render(<DsSelect label="Workspace" value="desk" options={OPTIONS} onChange={() => {}} />)
    const button = screen.getByRole('button', { name: 'Workspace' })
    expect(button).toHaveTextContent('Desk')
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('option', { name: 'Desk' })).toHaveAttribute('aria-selected', 'true')
  })

  it('reports a new value once and closes', () => {
    const onChange = vi.fn()
    render(<DsSelect label="Workspace" value="desk" options={OPTIONS} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Workspace' }))
    fireEvent.click(screen.getByRole('option', { name: 'MacBook Air' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('laptop')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('does not report re-picking the current value or a disabled option', () => {
    const onChange = vi.fn()
    render(<DsSelect label="Workspace" value="desk" options={OPTIONS} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Workspace' }))
    fireEvent.click(screen.getByRole('option', { name: 'Desk' }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace' }))
    fireEvent.click(screen.getByRole('option', { name: 'Unavailable' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('works from the keyboard and skips disabled options', () => {
    const onChange = vi.fn()
    render(<DsSelect label="Workspace" value="laptop" options={OPTIONS} onChange={onChange} />)
    const button = screen.getByRole('button', { name: 'Workspace' })
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('desk')
  })

  it('closes on Escape without changing the value', () => {
    const onChange = vi.fn()
    render(<DsSelect label="Workspace" value="desk" options={OPTIONS} onChange={onChange} />)
    const button = screen.getByRole('button', { name: 'Workspace' })
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})
