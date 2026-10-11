import { useId } from 'react'

// The Eudaimonai mark as a vector: a flat silver ring with a silver core,
// in the proportions of docs/brand/render-silver-icon.py (ring at 0.52 of the
// radius with a 0.085 tube, core 0.20). `tone` picks silver for light and
// dark grounds, or plain white for ultramarine.
export default function LogoMark({ size = 24, tone = 'silver', className = '', title }) {
  const id = useId().replace(/:/g, '')
  const fill = tone === 'white' ? '#FFFFFF' : `url(#${id})`
  return (
    <svg
      className={`site-logo-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {tone !== 'white' && (
        <defs>
          <linearGradient id={id} x1="0.15" y1="0.1" x2="0.85" y2="0.95">
            <stop offset="0" stopColor={tone === 'ink' ? '#3A3D47' : '#F4F5F8'} />
            <stop offset="0.55" stopColor={tone === 'ink' ? '#1D1D1F' : '#BEC3CD'} />
            <stop offset="1" stopColor={tone === 'ink' ? '#0B0C10' : '#8E95A2'} />
          </linearGradient>
        </defs>
      )}
      <circle cx="50" cy="50" r="26" fill="none" stroke={fill} strokeWidth="8.5" />
      <circle cx="50" cy="50" r="10" fill={fill} />
    </svg>
  )
}
