import { useMemo } from 'react'
import { buildPersonalRecords, RECORD_LABELS, RECORDS_MIN_SESSIONS } from '../lib/personalRecords'
import { fmtDuration } from '../lib/sessionAnalysisPresentation'

function formatRecord(key, value) {
  return key === 'dayScore' ? String(Math.round(value)) : fmtDuration(Math.round(value))
}

function formatDay(dayKey) {
  if (!dayKey) return ''
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** The debrief note when the session that just ended set a record. */
export function NewRecordNote({ records = [] }) {
  if (!records.length) return null
  return (
    <section className="report-records" aria-label="New personal record">
      <p className="report-records-kicker">{records.length === 1 ? 'New personal record' : 'New personal records'}</p>
      {records.map(record => (
        <div key={record.key} className="report-records-row">
          <span>{record.label}</span>
          <strong>{formatRecord(record.key, record.value)}</strong>
          <small>previous best {formatRecord(record.key, record.previous)}</small>
        </div>
      ))}
    </section>
  )
}

/** Analytics Overview: the user's standing records, or honest progress
 *  towards the 10 sessions records need. */
export function PersonalRecordsPanel({ sessions }) {
  const result = useMemo(() => buildPersonalRecords(sessions), [sessions])
  const entries = result.records
    ? Object.entries(result.records).filter(([, record]) => record)
    : []
  return (
    <section className="analytics-panel analytics-records" aria-labelledby="records-heading">
      <div className="analytics-section-heading">
        <div>
          <span className="analytics-kicker">Records</span>
          <h2 id="records-heading">Personal records</h2>
        </div>
        {!result.ready && <b>{result.qualifyingCount} of {RECORDS_MIN_SESSIONS}</b>}
      </div>
      {result.ready && !result.isCurrentMethod && (
        <p className="analytics-footnote">
          Earlier measurement method. Records on the current method start after {RECORDS_MIN_SESSIONS} sessions
          ({result.currentMethodCount} of {RECORDS_MIN_SESSIONS} so far); until then these stay as they were.
        </p>
      )}
      {result.ready && entries.length ? (
        <div className="analytics-overview-grid">
          {entries.map(([key, record]) => (
            <div key={key} className="analytics-overview-metric">
              <strong>{formatRecord(key, record.shown ?? record.value)}</strong>
              <span>{RECORD_LABELS[key]}</span>
              <small className="analytics-record-date">{formatDay(record.dayKey)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="analytics-copy">
          Records start after {RECORDS_MIN_SESSIONS} measured sessions of 5 minutes or more on your current camera method.
          {' '}Before that, almost every session would be a new best.
        </p>
      )}
    </section>
  )
}
