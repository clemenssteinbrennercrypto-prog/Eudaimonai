import { useRef, useState } from 'react'
import { ProtectionStartDialog } from './SessionIntentScreen'

const QUICK_DURATIONS = [
  [30, '30m'],
  [60, '1h'],
  [null, 'No limit'],
]

function PlayGlyph() {
  return <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor" /></svg>
}

// The Lab's primary action: name the work, pick a length, start. It starts
// the same session as the planning screen and asks the same question when
// Protection is not ready; plan, tags and energy stay on the Session page.
export default function LabQuickStart({ defaultDuration = 30, protection, onStart, onEditProtection, onOpenPlanner }) {
  const [task, setTask] = useState('')
  const initial = QUICK_DURATIONS.some(([value]) => value === defaultDuration) ? defaultDuration : 30
  const [duration, setDuration] = useState(initial)
  const [promptOpen, setPromptOpen] = useState(false)
  const inputRef = useRef(null)
  const canStart = task.trim().length > 0

  const start = () => onStart({ task: task.trim().slice(0, 80), duration })
  const requestStart = () => {
    if (!canStart) {
      inputRef.current?.focus()
      return
    }
    if (!protection || protection.state === 'ready' || !onEditProtection) start()
    else setPromptOpen(true)
  }

  return (
    <section className="lab-quick-start" aria-label="Start a session">
      <form onSubmit={event => { event.preventDefault(); requestStart() }}>
        <input
          ref={inputRef}
          id="lab-quick-start-task"
          value={task}
          onChange={event => setTask(event.target.value.slice(0, 80))}
          placeholder="What will you work on?"
          aria-label="What will you work on?"
          maxLength={80}
          autoComplete="off"
        />
        <div className="lab-quick-durations" role="group" aria-label="Session length">
          {QUICK_DURATIONS.map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={duration === value}
              className={duration === value ? 'is-active' : ''}
              onClick={() => setDuration(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="submit" className="ds-button-primary lab-quick-go" aria-disabled={!canStart} title="Start (↩)">
          <PlayGlyph /><span>Start</span>
        </button>
      </form>
      {onOpenPlanner && (
        <button type="button" className="lab-quick-planner" onClick={onOpenPlanner}>Plan in detail</button>
      )}
      {promptOpen && (
        <ProtectionStartDialog
          protection={protection}
          onClose={() => setPromptOpen(false)}
          onConfigure={() => { setPromptOpen(false); onEditProtection() }}
          onContinue={() => { setPromptOpen(false); start() }}
        />
      )}
    </section>
  )
}
