/** @vitest-environment jsdom */
import React from 'react'
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorkspaceCalibration from './WorkspaceCalibration'

const native = vi.hoisted(() => ({ landmarks: null, status: null }))

vi.mock('../lib/attention', () => ({
  analyzeFrame: vi.fn(() => ({ yawSigned: 1, pitchDeg: 2, pitchUpDeg: 0.5, irisH: 0.1 })),
}))

vi.mock('../lib/nativeCompanion', () => ({
  listenNativeCameraLandmarks: vi.fn(async callback => { native.landmarks = callback; return vi.fn() }),
  listenNativeCameraStatus: vi.fn(async callback => { native.status = callback; return vi.fn() }),
  setNativeCameraPreview: vi.fn(async () => null),
  startNativeCameraMeasurement: vi.fn(async () => ({ state: 'running' })),
  stopNativeCameraMeasurement: vi.fn(async () => ({ state: 'stopped' })),
}))

afterEach(() => {
  cleanup()
  native.landmarks = null
  native.status = null
  vi.clearAllMocks()
})

describe('WorkspaceCalibration native camera boundary', () => {
  it('captures native landmarks and never asks the WebView for camera pixels', async () => {
    const onDone = vi.fn()
    const mediaDevices = { getUserMedia: vi.fn() }
    Object.defineProperty(globalThis.navigator, 'mediaDevices', { configurable: true, value: mediaDevices })

    const { unmount } = render(
      <WorkspaceCalibration
        workspace={{
          id: 'desk',
          objects: [{ id: 'screen', type: 'monitor', role: 'primary_screen', col: 0.5, row: 0.5 }],
          calibration: { targets: {} },
        }}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    )

    await waitFor(() => expect(native.landmarks).toEqual(expect.any(Function)))
    await act(async () => {
      for (let index = 0; index < 30; index += 1) {
        native.landmarks({ facePresent: true, landmarks: [{ x: 0, y: 0, z: 0 }] })
      }
    })
    await waitFor(() => expect(screen.getByText('Target captured')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ status: 'calibrated' }))
    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled()
    expect(globalThis.window.FaceMesh).toBeUndefined()
    unmount()
  })
})
