import { useId } from 'react'
import { attentionMeaning, isHeightPlacedType, normalizeWorkspaceObjects } from '../lib/workspaceObjects'
import { workspaceGlyphPaths } from './workspaceGlyphs'

// A quiet top-down plan of the desk in the app's line-drawing idiom (the same
// glyphs as the editor's object list, see workspaceGlyphs). Colour carries one
// meaning only — what looking at the object does to the score
// (attentionMeaning): a thin green edge for work, yellow for a distraction,
// plain glass for everything else. No zones, no blue figure: the scorer has no
// zones, and ultramarine is reserved for the action.
const desk = { x: 28, y: 18, width: 344, height: 188 }
const TILE = 48
const GLYPH = 28
const user = { x: 200, y: 234 }

// Fit the occupied span of one axis onto the map: an affine map, so order
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

function devicePosition(device) {
  // A plan view: every object by its DEPTH, the user below the map. The 3D
  // editor's scene.z (1 = nearest) is that depth for screens and desk objects
  // alike. Objects from the old quick setup have no scene: their desk objects
  // store depth in row (0 = nearest), their screens only a height, which is
  // the best available stand-in there.
  const row = device.row ?? 0.5
  const nearness = Number.isFinite(device.scene?.z)
    ? device.scene.z
    : isHeightPlacedType(device.type) ? row : 1 - row
  return { across: device.col ?? 0.5, nearness }
}

// Tiles stay where the device is, but never touch. Tiles whose rows overlap
// form one row; within it they keep their left-to-right order and are spread
// to a minimum spacing by a forward pass (push right) and a backward pass
// (pull left from the desk edge), the least movement that satisfies both the
// spacing and the desk bounds whenever the row fits at all.
const SPACING = TILE + 6

function spreadRows(points) {
  const min = desk.x + TILE / 2 + 4
  const max = desk.x + desk.width - TILE / 2 - 4
  const rows = []
  for (const point of [...points].sort((a, b) => a.y - b.y)) {
    const row = rows.find(candidate => candidate.some(other => Math.abs(other.y - point.y) < TILE))
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

function deviceLabel(type) {
  return ({ camera: 'Camera', laptop: 'Laptop', monitor: 'Monitor', phone: 'Phone', ipad: 'iPad', keyboard: 'Keyboard', mouse: 'Mouse', notebook: 'Notebook', paper: 'Paper', book: 'Book' })[type] || 'Device'
}

function DeviceTile({ device, x, y, showLabels }) {
  const meaning = attentionMeaning(device)
  const scale = GLYPH / 16
  return <g
    className={`workspace-map-tile is-${meaning}`}
    data-attention-zone={meaning === 'neutral' ? undefined : meaning}
  >
    <rect x={x - TILE / 2} y={y - TILE / 2} width={TILE} height={TILE} rx="14" />
    <g
      className="workspace-map-glyph"
      data-device-type={device.type}
      transform={`translate(${x - GLYPH / 2} ${y - GLYPH / 2}) scale(${scale})`}
    >
      {workspaceGlyphPaths(device.type)}
    </g>
    {showLabels && <text x={x} y={y + TILE / 2 + 13} textAnchor="middle">{deviceLabel(device.type)}</text>}
  </g>
}

export default function WorkspaceAttentionMap({ devices, className, style, showLabels = false, ariaLabel }) {
  const workspaceDevices = normalizeWorkspaceObjects(devices)
  const rawId = useId()
  const clipId = `workspace-desk-${rawId.replace(/:/g, '')}`
  const placed = workspaceDevices
    .filter(device => !(device.type === 'camera' && device.cameraMount))
    .map(device => ({ device, ...devicePosition(device) }))
  const inset = TILE / 2 + 12
  const toX = fitAxis(placed.map(item => item.across), desk.x + inset, desk.x + desk.width - inset)
  const toY = fitAxis(placed.map(item => item.nearness), desk.y + inset, desk.y + desk.height - inset)
  const points = placed.map(item => ({ device: item.device, x: toX(item.across), y: toY(item.nearness) }))
  spreadRows(points)
  const tiles = points.map(({ device, x, y }) => <DeviceTile key={device.id} device={device} x={x} y={y} showLabels={showLabels} />)
  // A webcam on a display is drawn as the dot on that display (after the
  // display has found its spot), like the template drawings.
  const cameraDots = workspaceDevices
    .filter(device => device.type === 'camera' && device.cameraMount)
    .map(device => {
      const display = points.find(point => point.device.id === device.cameraMount.targetId)
      if (!display) return null
      return <circle
        key={device.id}
        className="workspace-map-camera"
        data-device-type="camera"
        cx={display.x + (device.cameraMount.offsetX || 0) * 12}
        cy={display.y - TILE / 2 + 6}
        r="2.6"
      />
    })

  return <svg
    className={['workspace-attention-map', className].filter(Boolean).join(' ')}
    style={style}
    viewBox="0 0 400 260"
    role="img"
    aria-label={ariaLabel || 'Top-down workspace map: green devices count as focus, yellow as distraction'}
    data-attention-map="true"
  >
    <defs><clipPath id={clipId}><rect x={desk.x} y={desk.y} width={desk.width} height={desk.height} rx="22" /></clipPath></defs>
    <rect className="workspace-map-desk" x={desk.x} y={desk.y} width={desk.width} height={desk.height} rx="22" />
    <g clipPath={`url(#${clipId})`}>{tiles}</g>
    {cameraDots}
    <g className="workspace-map-user" data-workspace-user="true" transform={`translate(${user.x} ${user.y})`}>
      <circle cy="-4" r="6" />
      <path d="M-16 18q16-16 32 0" />
      {showLabels && <text y="-16" textAnchor="middle">You</text>}
    </g>
  </svg>
}
