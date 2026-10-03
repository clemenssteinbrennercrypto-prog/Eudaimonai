// One display policy for every user-facing duration. Storage and exports keep
// their existing raw units; only presentation changes here.
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  if (total < 60) return `${total}s`

  const minutes = Math.floor(total / 60)
  if (total < 60 * 60) {
    const remainingSeconds = total % 60
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  }

  const hours = Math.floor(total / (60 * 60))
  const remainingMinutes = Math.floor((total % (60 * 60)) / 60)
  const remainingSeconds = total % 60
  return [
    `${hours}h`,
    remainingMinutes > 0 ? `${remainingMinutes}m` : null,
    remainingSeconds > 0 ? `${remainingSeconds}s` : null,
  ].filter(Boolean).join(' ')
}

// Summary totals (Lab, Analytics overview) are read at a glance, so they are
// rounded to the minute: "6h 10m", not "6h 9m 34s". Seconds only remain
// below one minute, where they are the whole value. Detail views keep
// formatDuration.
export function formatDurationCompact(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  if (total < 60) return `${total}s`
  return formatDuration(Math.round(total / 60) * 60)
}

export function formatMinutes(minutes) {
  return formatDuration((Number(minutes) || 0) * 60)
}

// Running clocks retain second precision. Once they cross one hour, the hour
// becomes an explicit field instead of allowing minutes to grow past 59.
export function formatTimer(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const hours = Math.floor(total / (60 * 60))
  const minutes = Math.floor((total % (60 * 60)) / 60)
  const remainingSeconds = total % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}
