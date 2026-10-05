/** @vitest-environment jsdom */
import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import Onboarding from './Onboarding'

const SLIDE_TITLES = [/Meet your\s+focus guardian/, /It reads the\s+signals of focus/, /Let it see\s+your focus/]

function slideButton() {
  return screen.getByRole('button', { name: /^(Show me|Continue|Enable camera|Try again)$/ })
}

function advance(ms) {
  act(() => { vi.advanceTimersByTime(ms) })
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete navigator.mediaDevices
})

describe('Onboarding slides', () => {
  // The slide button stays mounted while its label changes, so the second
  // click of a double-click used to land on the next slide and skip the
  // privacy explanation (reproduced in WebKit before this guard existed).
  it('does not let a double-click skip the privacy slide', () => {
    render(<Onboarding onComplete={vi.fn()} />)

    fireEvent.click(slideButton(), { detail: 1 })
    advance(230)
    fireEvent.click(slideButton(), { detail: 2 })
    advance(1000)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(SLIDE_TITLES[1])
  })

  it('ignores input until the next slide has finished fading in', () => {
    render(<Onboarding onComplete={vi.fn()} />)

    fireEvent.click(slideButton(), { detail: 1 })
    advance(300)
    fireEvent.click(slideButton(), { detail: 1 })
    advance(1000)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(SLIDE_TITLES[1])

    fireEvent.click(slideButton(), { detail: 1 })
    advance(1000)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(SLIDE_TITLES[2])
  })

  it('offers the privacy policy on the camera slide', () => {
    const onOpenPrivacy = vi.fn()
    render(<Onboarding onComplete={vi.fn()} onOpenPrivacy={onOpenPrivacy} />)
    expect(screen.queryByRole('button', { name: 'Privacy Policy' })).toBeNull()

    for (let i = 0; i < 2; i++) {
      fireEvent.click(slideButton(), { detail: 1 })
      advance(1000)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Privacy Policy' }))

    expect(onOpenPrivacy).toHaveBeenCalledTimes(1)
  })

  it('lets a denied camera continue into the app and remembers onboarding', async () => {
    navigator.mediaDevices = {
      getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
    }
    const onComplete = vi.fn()
    render(<Onboarding onComplete={onComplete} />)
    for (let i = 0; i < 2; i++) {
      fireEvent.click(slideButton(), { detail: 1 })
      advance(1000)
    }

    await act(async () => { fireEvent.click(slideButton(), { detail: 1 }) })

    expect(screen.getByRole('alert')).toHaveTextContent('System Settings › Privacy & Security › Camera')
    expect(slideButton()).toHaveTextContent('Try again')
    fireEvent.click(screen.getByRole('button', { name: 'Continue without camera' }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('eudaimonia_onboarded')).toBe('true')
  })
})
