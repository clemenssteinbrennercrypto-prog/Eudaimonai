import { useId } from 'react'
import { attentionMeaning, isHeightPlacedType, normalizeWorkspaceObjects } from '../lib/workspaceObjects'

const navy = '#2C46FF'
const ZONE_COLOR = { focus: '#2f855a', distraction: '#c2413b', elsewhere: '#c47f1a' }
const desk = { x: 50, y: 34, width: 300, height: 160 }
const user = { x: 200, y: 235 }
const FIELD = { from: -168, to: -12, radius: 225 }
// Half-width of the wedge from the user's seat to an object, in degrees.
// Screens are wide and looked at across their whole face; a pad, the mouse
// or a phone is a smaller target.
const WEDGE_HALF_DEG = { screen: 20, object: 13 }
// Radial reach of a zone toward and away from the seat. Looking at a screen
// covers everything behind it; a desk object is a patch around itself.
const ZONE_DEPTH = { screen: { near: 34, far: FIELD.radius }, object: { near: 30, far: 30 } }
const SPACING = 44

// Fit the occupied span of one axis onto the desk: an affine map, so order
// and distance ratios survive. Spans narrower than MIN_SPAN are not blown up
// beyond 1 / MIN_SPAN (2.5×), so two neighbours never fly apart.
const MIN_SPAN = 0.4
function fitAxis(values, from, to) {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = Math.max(hi - lo, MIN_SPAN)
  const mid = (lo + hi) / 2
  return value => from + ((value - mid) / span + 0.5) * (to - from)
}

// A plan view: every object by its DEPTH, the user below the map. The 3D
// editor's scene.z (1 = nearest) is that depth for screens and desk objects
// alike. Objects from the old quick setup have no scene: their desk objects
// store depth in row (0 = nearest), their screens only a height.
function devicePosition(device) {
  const row = device.row ?? 0.5
  const nearness = Number.isFinite(device.scene?.z)
    ? device.scene.z
    : isHeightPlacedType(device.type) ? row : 1 - row
  return { across: device.col ?? 0.5, nearness }
}

// Icons whose rows overlap keep their left-to-right order and are spread to a
// minimum spacing by a forward and a backward pass, staying on the desk.
function spreadRows(points) {
  const min = desk.x + SPACING / 2
  const max = desk.x + desk.width - SPACING / 2
  const rows = []
  for (const point of [...points].sort((a, b) => a.y - b.y)) {
    const row = rows.find(candidate => candidate.some(other => Math.abs(other.y - point.y) < SPACING * 0.8))
    if (row) row.push(point)
    else rows.push([point])
  }
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x)
    for (let i = 0; i < row.length; i += 1) {
      row[i].x = Math.max(row[i].x, min, i ? row[i - 1].x + SPACING : -Infinity)
    }
    for (let i = row.length - 1; i >= 0; i -= 1) {
      row[i].x = Math.min(row[i].x, max, i < row.length - 1 ? row[i + 1].x - SPACING : Infinity)
    }
  }
}

function polarPoint(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: user.x + Math.cos(rad) * radius, y: user.y + Math.sin(rad) * radius }
}

function fanPath(leftAngle, rightAngle, radius = FIELD.radius) {
  const left = polarPoint(leftAngle, radius)
  const right = polarPoint(rightAngle, radius)
  return `M ${user.x} ${user.y} L ${left.x} ${left.y} A ${radius} ${radius} 0 0 1 ${right.x} ${right.y} Z`
}

// The zone of one object: an annular sector around it as seen from the seat —
// its direction ± halfDeg and its distance ± depth. Direction alone (a ray to
// the edge) would paint a pad red because a phone lies behind it; the scorer
// separates the two by how far down the head points, i.e. by distance.
function zoneAround(point, halfDeg, depth) {
  const angle = Math.atan2(point.y - user.y, point.x - user.x) * 180 / Math.PI
  const distance = Math.hypot(point.x - user.x, point.y - user.y)
  const from = Math.max(FIELD.from, angle - halfDeg)
  const to = Math.min(FIELD.to, angle + halfDeg)
  const inner = Math.max(0, distance - depth.near)
  const outer = Math.min(FIELD.radius, distance + depth.far)
  const a = polarPoint(from, outer)
  const b = polarPoint(to, outer)
  const c = polarPoint(to, inner)
  const d = polarPoint(from, inner)
  return `M ${a.x} ${a.y} A ${outer} ${outer} 0 0 1 ${b.x} ${b.y} L ${c.x} ${c.y} A ${inner} ${inner} 0 0 0 ${d.x} ${d.y} Z`
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

// Zones mirror the scorer, not a fixed picture: a green wedge from the seat to
// every work object, a red one to every distraction device
// (attentionMeaning), and yellow for everything in between — the space where
// looking costs points by distance (offTargetAttention.js).
export default function WorkspaceAttentionMap({ devices, className, style, showLabels = false, ariaLabel }) {
  const workspaceDevices = normalizeWorkspaceObjects(devices)
  const rawId = useId()
  const clipId = `workspace-desk-${rawId.replace(/:/g, '')}`

  const placed = workspaceDevices
    .filter(device => !(device.type === 'camera' && device.cameraMount))
    .map(device => ({ device, ...devicePosition(device) }))
  const inset = 30
  const toX = fitAxis(placed.map(item => item.across), desk.x + inset, desk.x + desk.width - inset)
  const toY = fitAxis(placed.map(item => item.nearness), desk.y + inset, desk.y + desk.height - inset)
  const points = placed.map(item => ({ device: item.device, x: toX(item.across), y: toY(item.nearness) }))
  spreadRows(points)

  const cameras = workspaceDevices
    .filter(device => device.type === 'camera' && device.cameraMount)
    .map(device => {
      const display = points.find(point => point.device.id === device.cameraMount.targetId)
      return display && { device, x: display.x + (device.cameraMount.offsetX || 0) * 18, y: display.y - 20 }
    })
    .filter(Boolean)

  const wedges = points
    .map(point => ({ point, meaning: attentionMeaning(point.device) }))
    .filter(item => item.meaning !== 'neutral')
    .sort((a, b) => (a.meaning === 'distraction') - (b.meaning === 'distraction'))

  return <svg
    className={className}
    style={style}
    viewBox="0 0 400 260"
    role="img"
    aria-label={ariaLabel || 'Top-down workspace map: green zones count as focus, red as distraction, yellow costs points the further you look'}
    data-attention-map="true"
  >
    <defs><clipPath id={clipId}><rect x={desk.x} y={desk.y} width={desk.width} height={desk.height} rx="20" /></clipPath></defs>
    <rect x={desk.x} y={desk.y} width={desk.width} height={desk.height} rx="20" fill="#0d1330" stroke="#3a4d91" strokeWidth="2" />
    <g clipPath={`url(#${clipId})`}>
      <path d={fanPath(FIELD.from, FIELD.to)} fill={ZONE_COLOR.elsewhere} opacity=".18" data-attention-zone="elsewhere" />
      {wedges.map(({ point, meaning }) => <path
        key={point.device.id}
        d={isHeightPlacedType(point.device.type)
          ? zoneAround(point, WEDGE_HALF_DEG.screen, ZONE_DEPTH.screen)
          : zoneAround(point, WEDGE_HALF_DEG.object, ZONE_DEPTH.object)}
        fill={ZONE_COLOR[meaning]}
        opacity={meaning === 'distraction' ? '.42' : '.34'}
        data-attention-zone={meaning}
      />)}
    </g>
    {[...points, ...cameras].map(({ device, x, y }) => <g key={device.id}>
      <DeviceIcon type={device.type} x={x} y={y} />
      {showLabels && device.type !== 'camera' && <text x={x} y={y + 30} textAnchor="middle" fontSize="10" fontWeight="700" fill="#9eaad9">{deviceLabel(device.type)}</text>}
    </g>)}
    <g transform={`translate(${user.x} ${user.y})`} data-workspace-user="true">
      <circle cy="-10" r="12" fill={navy} />
      <path d="M-22 18Q0-2 22 18" fill={navy} />
      {showLabels && <text y="20" textAnchor="middle" fontSize="10" fontWeight="800" fill="#fff">You</text>}
    </g>
  </svg>
}
