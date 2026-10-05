import { useId } from 'react'
import { attentionMeaning, defaultRoleForType, isHeightPlacedType, isScreenRole, normalizeWorkspaceObjects } from '../lib/workspaceObjects'

const navy = '#2C46FF'
// The attention colours: what looking at an object does to the score.
const MEANING_COLOR = { focus: 'var(--ds-attn-high)', distraction: 'var(--ds-attn-low)' }
const desk = { x: 50, y: 34, width: 300, height: 160 }
const user = { x: 200, y: 235 }

function devicePoint(device, devices = []) {
  const mount = device.type === 'camera' ? device.cameraMount : null
  const target = mount && devices.find(candidate => candidate.id === mount.targetId)
  if (target) {
    const anchor = devicePoint(target, devices)
    return { x: anchor.x + (mount.offsetX || 0) * 18, y: anchor.y - (mount.style === 'top' ? 20 : 12) }
  }
  // The user sits below the map. Screens are drawn by height (row 0 = top);
  // desk objects store depth (row 0 = nearest the user), so they are mirrored
  // to land near the user.
  const row = device.row ?? 0.5
  return {
    x: desk.x + 32 + (device.col ?? 0.5) * (desk.width - 64),
    y: desk.y + 26 + (isHeightPlacedType(device.type) ? row : 1 - row) * (desk.height - 52),
  }
}

function polarPoint(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180
  return {
    x: user.x + Math.cos(rad) * radius,
    y: user.y + Math.sin(rad) * radius,
  }
}

function fanPath(leftAngle, rightAngle, radius) {
  const left = polarPoint(leftAngle, radius)
  const right = polarPoint(rightAngle, radius)
  return `M ${user.x} ${user.y} L ${left.x} ${left.y} A ${radius} ${radius} 0 0 1 ${right.x} ${right.y} Z`
}

function productiveFanPath(screenDevices) {
  if (!screenDevices.length) return fanPath(-128, -52, 218)
  const angles = screenDevices.map(device => {
    const point = devicePoint(device)
    return Math.atan2(point.y - user.y, point.x - user.x) * 180 / Math.PI
  })
  return fanPath(Math.max(-160, Math.min(...angles) - 22), Math.min(-20, Math.max(...angles) + 22), 222)
}

function DeviceIcon({ type, x, y }) {
  const shared = { 'data-device-type': type }

  if (type === 'monitor') return <g {...shared} transform={`translate(${x - 18} ${y - 13})`}>
    <rect width="36" height="23" rx="3" fill="#111936" stroke={navy} strokeWidth="2" />
    <rect x="4" y="4" width="28" height="14" rx="1" fill="#2c46ff" opacity=".28" />
    <path d="M18 23v6M11 29h14" stroke={navy} strokeWidth="2" strokeLinecap="round" />
  </g>

  if (type === 'laptop') return <g {...shared} transform={`translate(${x - 20} ${y - 12})`}>
    <rect x="5" width="30" height="20" rx="3" fill="#111936" stroke={navy} strokeWidth="2" />
    <rect x="9" y="4" width="22" height="12" rx="1" fill="#2c46ff" opacity=".28" />
    <path d="M2 24h36l-4-4H6Z" fill="#1b2450" stroke={navy} strokeWidth="2" strokeLinejoin="round" />
  </g>

  if (type === 'camera') return <g {...shared} transform={`translate(${x - 15} ${y - 8})`}>
    <circle cx="15" cy="8" r="5" fill="#141c42" stroke={navy} strokeWidth="2" />
    <circle cx="15" cy="8" r="2.5" fill="#080d20" stroke="#9bb0ff" strokeWidth="1.25" />
  </g>

  if (type === 'phone') return <g {...shared} transform={`translate(${x - 8} ${y - 17})`}>
    <rect width="16" height="34" rx="4" fill="#111936" stroke={navy} strokeWidth="2" />
    <rect x="3" y="5" width="10" height="21" rx="2" fill="#2c46ff" opacity=".24" />
  </g>

  if (type === 'ipad') return <g {...shared} transform={`translate(${x - 12} ${y - 16})`}>
    <rect width="24" height="32" rx="4" fill="#111936" stroke={navy} strokeWidth="2" />
    <rect x="4" y="4" width="16" height="23" rx="2" fill="#2c46ff" opacity=".24" />
  </g>

  if (type === 'keyboard') return <g {...shared} transform={`translate(${x - 20} ${y - 9})`}>
    <rect width="40" height="18" rx="4" fill="#1b2450" stroke={navy} strokeWidth="2" />
    <path d="M6 6h28M6 11h28M11 3v11M20 3v11M29 3v11" stroke="#9bb0ff" strokeWidth="1" opacity=".65" />
  </g>

  if (type === 'mouse') return <g {...shared} transform={`translate(${x} ${y})`}>
    <ellipse rx="9" ry="13" fill="#1b2450" stroke={navy} strokeWidth="2" />
    <path d="M0-9v7" stroke="#9bb0ff" strokeWidth="1.5" strokeLinecap="round" />
  </g>

  if (type === 'paper' || type === 'notebook' || type === 'book') return <g {...shared} transform={`translate(${x - 15} ${y - 17})`}>
    <rect width="30" height="34" rx="3" fill={type === 'book' ? '#1b2450' : '#dbe3ff'} stroke={navy} strokeWidth="2" />
    <path d="M6 10h18M6 17h16M6 24h18" stroke={type === 'book' ? '#9bb0ff' : '#5368bc'} strokeWidth="1.5" />
  </g>

  return <g {...shared} transform={`translate(${x - 14} ${y - 14})`}><rect width="28" height="28" rx="5" fill="#1b2450" stroke={navy} strokeWidth="2" /></g>
}

function deviceLabel(type) {
  return ({ camera: 'Camera', laptop: 'Laptop', monitor: 'Monitor', phone: 'Phone', ipad: 'iPad', keyboard: 'Keyboard', mouse: 'Mouse', notebook: 'Notebook', paper: 'Paper', book: 'Book' })[type] || 'Device'
}

export default function WorkspaceAttentionMap({ devices, className, style, showLabels = false, ariaLabel }) {
  const workspaceDevices = normalizeWorkspaceObjects(devices)
  const screens = workspaceDevices.filter(device => isScreenRole(device.role || defaultRoleForType(device.type)))
  const rawId = useId()
  const clipId = `workspace-desk-${rawId.replace(/:/g, '')}`

  return <svg
    className={className}
    style={style}
    viewBox="0 0 400 260"
    role="img"
    aria-label={ariaLabel || 'Top-down workspace map with gaze zones and device positions'}
    data-attention-map="true"
  >
    <defs><clipPath id={clipId}><rect x={desk.x} y={desk.y} width={desk.width} height={desk.height} rx="20" /></clipPath></defs>
    <rect x={desk.x} y={desk.y} width={desk.width} height={desk.height} rx="20" fill="#0d1330" stroke="#3a4d91" strokeWidth="2" />
    {/* Only what the scorer actually uses: the direction of the screens, and
        a halo per object in the colour of its effect (attentionMeaning). Fixed
        "ambiguous" fans and a red strip along the front edge used to cover the
        very place where pads and the mouse sit, contradicting the score. */}
    <g clipPath={`url(#${clipId})`}>
      <path d={productiveFanPath(screens)} fill={MEANING_COLOR.focus} opacity=".14" data-attention-zone="productive" />
    </g>
    {workspaceDevices.map((device, index) => {
      const base = devicePoint(device, workspaceDevices)
      const overlaps = device.cameraMount ? 0 : workspaceDevices.slice(0, index).filter(previous =>
        Math.abs((previous.col ?? 0.5) - (device.col ?? 0.5)) < 0.02 &&
        Math.abs((previous.row ?? 0.5) - (device.row ?? 0.5)) < 0.02
      ).length
      const x = base.x + overlaps * 18
      const y = base.y + overlaps * 5.4
      const meaning = attentionMeaning(device)
      return <g key={device.id || `${device.type}-${index}`}>
        {meaning !== 'neutral' && <circle
          cx={x}
          cy={y}
          r="24"
          fill={MEANING_COLOR[meaning]}
          fillOpacity=".18"
          stroke={MEANING_COLOR[meaning]}
          strokeOpacity=".75"
          strokeWidth="1.5"
          data-attention-zone={meaning}
        />}
        <DeviceIcon type={device.type} x={x} y={y} />
        {showLabels && <text x={x} y={y + 30} textAnchor="middle" fontSize="10" fontWeight="700" fill="#9eaad9">{deviceLabel(device.type)}</text>}
      </g>
    })}
    <g transform={`translate(${user.x} ${user.y})`} data-workspace-user="true">
      <circle cy="-10" r="12" fill={navy} />
      <path d="M-22 18Q0-2 22 18" fill={navy} />
      {showLabels && <text y="20" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">You</text>}
    </g>
  </svg>
}
