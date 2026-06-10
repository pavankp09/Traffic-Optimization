import type { VehicleFrame, SignalState, AdverseEvent } from '../types'

export const VEHICLE_COLORS: Record<string, string> = {
  car:           '#60a5fa',
  two_wheeler:   '#c084fc',
  ev_scooter:    '#34d399',
  auto_rickshaw: '#f59e0b',
  e_rickshaw:    '#6ee7b7',
  cab:           '#fbbf24',
  delivery_bike: '#fb923c',
  tsrtc_bus:     '#f87171',
  school_bus:    '#fcd34d',
  truck:         '#94a3b8',
}

export const PHASE_COLORS: Record<number, string> = {
  0: '#10b981',
  1: '#f59e0b',
  2: '#10b981',
  3: '#f59e0b',
  4: '#ef4444',
}

// [bodyLength, bodyWidth] in world units
const VEHICLE_DIMS: Record<string, [number, number]> = {
  car:           [3.8, 1.8],
  two_wheeler:   [2.0, 0.8],
  ev_scooter:    [2.1, 0.9],
  auto_rickshaw: [2.9, 1.7],
  e_rickshaw:    [3.1, 1.7],
  cab:           [4.1, 1.9],
  delivery_bike: [2.0, 0.8],
  tsrtc_bus:     [9.5, 2.4],
  school_bus:    [7.5, 2.4],
  truck:         [8.5, 2.6],
}

const ARM_ANGLE: Record<string, number> = {
  N: Math.PI / 2,
  S: -Math.PI / 2,
  E: Math.PI,
  W: 0,
}

// ── Layout constants ─────────────────────────────────────────────────────────
const ROAD_HALF_PX = 72    // pixels: half total road width (≈14.4 world units)
const MEDIAN_PX    = 8     // centre median half-width in pixels
const LANE_W_PX    = 21    // pixels per lane
const LANE_DIV_1   = MEDIAN_PX + LANE_W_PX       // inner↔mid boundary  = 29 px
const LANE_DIV_2   = MEDIAN_PX + 2 * LANE_W_PX   // mid↔outer boundary  = 50 px
const STOP_PX      = 99    // pixels from canvas centre to stop line
const CORNER_R     = 14    // kerb corner radius at intersection arm entries
const FOOTPATH     = '#0d1520'  // sidewalk / footpath surface colour

export interface RenderConfig {
  width:      number
  height:     number
  scale:      number
  offsetX:    number
  offsetY:    number
  showTrails: boolean
  showLabels: boolean
  showGrid:   boolean
}

export function getDefaultRenderConfig(width: number, height: number): RenderConfig {
  return { width, height, scale: 5, offsetX: width / 2, offsetY: height / 2,
           showTrails: true, showLabels: false, showGrid: true }
}

export function worldToCanvas(x: number, y: number, cfg: RenderConfig): [number, number] {
  return [x * cfg.scale + cfg.offsetX, y * cfg.scale + cfg.offsetY]
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const cr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + cr, y)
  ctx.lineTo(x + w - cr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + cr)
  ctx.lineTo(x + w, y + h - cr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h)
  ctx.lineTo(x + cr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - cr)
  ctx.lineTo(x, y + cr)
  ctx.quadraticCurveTo(x, y, x + cr, y)
  ctx.closePath()
}

// ── Background ───────────────────────────────────────────────────────────────

export function clearCanvas(ctx: CanvasRenderingContext2D, cfg: RenderConfig): void {
  ctx.fillStyle = '#080c12'
  ctx.fillRect(0, 0, cfg.width, cfg.height)
}

export function drawGrid(ctx: CanvasRenderingContext2D, cfg: RenderConfig): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.025)'
  ctx.lineWidth = 1
  const step = 60
  for (let x = 0; x < cfg.width; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cfg.height); ctx.stroke()
  }
  for (let y = 0; y < cfg.height; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cfg.width, y); ctx.stroke()
  }
}

// ── Road & Intersection ──────────────────────────────────────────────────────

function drawYRoad(ctx: CanvasRenderingContext2D, cx: number, cy: number, rh: number, width: number, height: number): void {
  const len  = Math.max(width, height) * 1.1
  const arms: { angle: number; label: string }[] = [
    { angle: -Math.PI / 2,                         label: 'NORTH' },
    { angle: -Math.PI / 2 + (2 * Math.PI / 3),    label: 'SE'    },
    { angle: -Math.PI / 2 - (2 * Math.PI / 3),    label: 'SW'    },
  ]

  // Footpath base
  ctx.fillStyle = FOOTPATH
  ctx.fillRect(0, 0, width, height)

  // Road arms
  arms.forEach(({ angle }) => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)

    ctx.fillStyle = '#1a2230'
    ctx.fillRect(0, -rh, len, rh * 2)

    ctx.strokeStyle = 'rgba(71,85,105,0.75)'
    ctx.lineWidth   = 1.5
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(0, -rh); ctx.lineTo(len, -rh)
    ctx.moveTo(0,  rh); ctx.lineTo(len,  rh)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(250,204,21,0.60)'
    ctx.lineWidth   = 1.5
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, s * MEDIAN_PX); ctx.lineTo(len, s * MEDIAN_PX)
      ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth   = 1
    ctx.setLineDash([12, 10])
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, s * LANE_DIV_1); ctx.lineTo(len, s * LANE_DIV_1)
      ctx.stroke()
    }
    ctx.setLineDash([])

    ctx.strokeStyle = 'rgba(229,231,235,0.85)'
    ctx.lineWidth   = 2.5
    ctx.beginPath()
    ctx.moveTo(STOP_PX, MEDIAN_PX); ctx.lineTo(STOP_PX, rh)
    ctx.stroke()

    ctx.restore()
  })

  // Central hexagonal junction polygon
  ctx.fillStyle = '#1e2a3a'
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a  = (i * Math.PI) / 3
    const px = cx + rh * Math.cos(a)
    const py = cy + rh * Math.sin(a)
    if (i === 0) ctx.moveTo(px, py)
    else         ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth   = 1.5
  ctx.stroke()

  // Arm labels
  ctx.font          = 'bold 11px monospace'
  ctx.letterSpacing = '0.10em'
  ctx.fillStyle     = 'rgba(148,163,184,0.55)'
  ctx.textAlign     = 'center'
  arms.forEach(({ angle, label }) => {
    const lx = cx + (rh * 2 + 16) * Math.cos(angle) * 1.8
    const ly = cy + (rh * 2 + 16) * Math.sin(angle) * 1.8
    ctx.fillText(label, lx, ly + 4)
  })
  ctx.letterSpacing = '0'
}

function drawSixRoads(ctx: CanvasRenderingContext2D, cx: number, cy: number, rh: number, width: number, height: number): void {
  const len = Math.max(width, height) * 1.1

  // Footpath base
  ctx.fillStyle = FOOTPATH
  ctx.fillRect(0, 0, width, height)

  // 6 road arms at 60° intervals
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)

    ctx.fillStyle = '#1a2230'
    ctx.fillRect(0, -rh, len, rh * 2)

    ctx.strokeStyle = 'rgba(71,85,105,0.75)'
    ctx.lineWidth   = 1.5
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(0, -rh); ctx.lineTo(len, -rh)
    ctx.moveTo(0,  rh); ctx.lineTo(len,  rh)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(250,204,21,0.60)'
    ctx.lineWidth   = 1.5
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, s * MEDIAN_PX); ctx.lineTo(len, s * MEDIAN_PX)
      ctx.stroke()
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.20)'
    ctx.lineWidth   = 1
    ctx.setLineDash([12, 10])
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, s * LANE_DIV_1); ctx.lineTo(len, s * LANE_DIV_1)
      ctx.stroke()
    }
    ctx.setLineDash([])

    ctx.strokeStyle = 'rgba(229,231,235,0.85)'
    ctx.lineWidth   = 2.5
    ctx.beginPath()
    ctx.moveTo(STOP_PX, MEDIAN_PX); ctx.lineTo(STOP_PX, rh)
    ctx.stroke()

    ctx.restore()
  }

  // Central hexagonal junction polygon (with slightly concave inter-arm recesses)
  ctx.fillStyle = '#1e2a3a'
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a    = (i * Math.PI) / 3
    const next = ((i + 1) * Math.PI) / 3
    const px   = cx + rh * Math.cos(a - Math.PI / 6)
    const py   = cy + rh * Math.sin(a - Math.PI / 6)
    const qx   = cx + rh * Math.cos(a + Math.PI / 6)
    const qy   = cy + rh * Math.sin(a + Math.PI / 6)
    if (i === 0) ctx.moveTo(px, py)
    ctx.lineTo(qx, qy)
    const mx   = cx + rh * 0.82 * Math.cos((a + next) / 2)
    const my   = cy + rh * 0.82 * Math.sin((a + next) / 2)
    ctx.lineTo(mx, my)
  }
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth   = 1.5
  ctx.stroke()

  // Arm labels
  const LABEL_NAMES = ['E', 'SE', 'SW', 'W', 'NW', 'NE']
  ctx.font          = 'bold 11px monospace'
  ctx.letterSpacing = '0.10em'
  ctx.fillStyle     = 'rgba(148,163,184,0.55)'
  ctx.textAlign     = 'center'
  for (let i = 0; i < 6; i++) {
    const a  = (i * Math.PI) / 3
    const lx = cx + (rh * 2 + 20) * Math.cos(a)
    const ly = cy + (rh * 2 + 20) * Math.sin(a)
    ctx.fillText(LABEL_NAMES[i], lx, ly + 4)
  }
  ctx.letterSpacing = '0'
}

function drawFreeleftSlip(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rh: number
): void {
  // Draw channelised triangular islands + slip lanes at all 4 corners
  const corners = [
    { ix: cx + rh, iy: cy - rh, a1x: cx + rh + 20, a1y: cy - rh,      a2x: cx + rh,      a2y: cy - rh - 20, ex: cx + rh + 14, ey: cy - rh - 14 },
    { ix: cx + rh, iy: cy + rh, a1x: cx + rh,       a1y: cy + rh + 20, a2x: cx + rh + 20, a2y: cy + rh,      ex: cx + rh + 14, ey: cy + rh + 14 },
    { ix: cx - rh, iy: cy + rh, a1x: cx - rh - 20,  a1y: cy + rh,      a2x: cx - rh,      a2y: cy + rh + 20, ex: cx - rh - 14, ey: cy + rh + 14 },
    { ix: cx - rh, iy: cy - rh, a1x: cx - rh,        a1y: cy - rh - 20, a2x: cx - rh - 20, a2y: cy - rh,     ex: cx - rh - 14, ey: cy - rh - 14 },
  ]
  corners.forEach(({ ix, iy, a1x, a1y, a2x, a2y, ex, ey }) => {
    // Slip lane surface
    ctx.fillStyle = '#161c26'
    ctx.beginPath()
    ctx.moveTo(ix, iy)
    ctx.quadraticCurveTo(ex, ey, a2x, a2y)
    ctx.lineTo(a1x, a1y)
    ctx.closePath()
    ctx.fill()
    // Island triangle
    ctx.fillStyle = '#0a0e15'
    ctx.beginPath()
    ctx.moveTo(ix, iy)
    ctx.lineTo(a1x, a1y)
    ctx.lineTo(a2x, a2y)
    ctx.closePath()
    ctx.fill()
    // Island kerb outline
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(ix, iy)
    ctx.lineTo(a1x, a1y)
    ctx.lineTo(a2x, a2y)
    ctx.closePath()
    ctx.stroke()
  })
}

// ── Turn arrows (painted road markings) ─────────────────────────────────────
function drawTurnArrow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  heading: number,
  type: 'straight' | 'right' | 'left' | 'straight_right' | 'straight_left'
): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(heading)
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth   = 1.5
  ctx.lineCap     = 'round'
  ctx.lineJoin    = 'round'

  const SHAFT = 10, HEAD = 3.5

  const shaft = () => {
    ctx.beginPath()
    ctx.moveTo(0,  SHAFT * 0.5)
    ctx.lineTo(0, -SHAFT * 0.5)
    ctx.moveTo(-HEAD, -SHAFT * 0.5 + HEAD + 1)
    ctx.lineTo(0, -SHAFT * 0.5 - 1)
    ctx.lineTo( HEAD, -SHAFT * 0.5 + HEAD + 1)
    ctx.stroke()
  }

  const rightArc = (ox: number) => {
    const R = 5
    ctx.beginPath()
    ctx.moveTo(ox, SHAFT * 0.3)
    ctx.arc(ox + R, SHAFT * 0.3, R, Math.PI, -Math.PI / 2)
    ctx.stroke()
    const ex = ox + R * 2, ey = SHAFT * 0.3 - R
    ctx.beginPath()
    ctx.moveTo(ex - HEAD, ey); ctx.lineTo(ex, ey - HEAD); ctx.lineTo(ex, ey + HEAD * 0.5)
    ctx.stroke()
  }

  const leftArc = (ox: number) => {
    const R = 5
    ctx.beginPath()
    ctx.moveTo(ox, SHAFT * 0.3)
    ctx.arc(ox - R, SHAFT * 0.3, R, 0, -Math.PI / 2, true)
    ctx.stroke()
    const ex = ox - R * 2, ey = SHAFT * 0.3 - R
    ctx.beginPath()
    ctx.moveTo(ex + HEAD, ey); ctx.lineTo(ex, ey - HEAD); ctx.lineTo(ex, ey + HEAD * 0.5)
    ctx.stroke()
  }

  if (type === 'straight')       shaft()
  if (type === 'right')          rightArc(0)
  if (type === 'left')           leftArc(0)
  if (type === 'straight_right') { shaft(); rightArc(4) }
  if (type === 'straight_left')  { shaft(); leftArc(-4) }

  ctx.restore()
}

// ── Intersection box KEEP CLEAR hatch ────────────────────────────────────────
function drawJunctionHatch(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rh: number
): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(cx - rh + 1, cy - rh + 1, rh * 2 - 2, rh * 2 - 2)
  ctx.clip()
  ctx.strokeStyle = 'rgba(250,204,21,0.065)'
  ctx.lineWidth   = 1
  ctx.setLineDash([])
  const step = 18, ext = rh * 4
  for (let offset = -ext; offset < ext * 2; offset += step) {
    ctx.beginPath()
    ctx.moveTo(cx - rh + offset, cy - rh)
    ctx.lineTo(cx - rh + offset + ext, cy - rh + ext)
    ctx.stroke()
  }
  ctx.restore()
}

function drawZebraCrossing(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rh: number,
  arm: 'N' | 'S' | 'E' | 'W'
): void {
  // 3 clean white lines — simple, premium pedestrian crossing
  const STRIPE_W  = 5
  const GAP_W     = 5
  const N_STRIPES = 3
  const CROSS_LEN = rh * 2
  const CROSS_W   = N_STRIPES * STRIPE_W + (N_STRIPES - 1) * GAP_W   // 3×5 + 2×5 = 25px

  ctx.save()
  ctx.translate(cx, cy)
  if      (arm === 'N') { ctx.translate(0, -rh - CROSS_W - 2) }
  else if (arm === 'S') { ctx.translate(0,  rh + 2) }
  else if (arm === 'E') { ctx.rotate(Math.PI / 2); ctx.translate(0, -rh - CROSS_W - 2) }
  else                  { ctx.rotate(Math.PI / 2); ctx.translate(0,  rh + 2) }

  // Draw in two halves — skip center median (MEDIAN_PX wide on each side)
  const MEDIAN = MEDIAN_PX   // 8px median gap each side
  const halfLen = CROSS_LEN / 2 - MEDIAN
  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  for (let i = 0; i < N_STRIPES; i++) {
    const yPos = i * (STRIPE_W + GAP_W)
    // Left half of road (negative side)
    ctx.fillRect(-CROSS_LEN / 2, yPos, halfLen, STRIPE_W)
    // Right half of road (positive side)
    ctx.fillRect(MEDIAN, yPos, halfLen, STRIPE_W)
  }

  ctx.restore()
}

export function drawIntersection(ctx: CanvasRenderingContext2D, cfg: RenderConfig, intersectionType: string = "four_way"): void {
  const cx = cfg.offsetX
  const cy = cfg.offsetY
  const rh = ROAD_HALF_PX
  const isTJunction = intersectionType === 't_junction' || intersectionType === 't_junction_free_left'
  const isYJunction = intersectionType === 'y_junction'
  const isSixArm = intersectionType === 'six_arm'
  const isRoundabout = intersectionType === 'roundabout' || intersectionType === 'roundabout_free_left'
  const hasFreeLeft = intersectionType === 'four_way_free_left' || intersectionType === 't_junction_free_left' || intersectionType === 'roundabout_free_left'

  // ── Footpath / sidewalk base ──────────────────────────────────────────────
  ctx.fillStyle = FOOTPATH
  ctx.fillRect(0, 0, cfg.width, cfg.height)

  if (isYJunction) {
    drawYRoad(ctx, cx, cy, rh, cfg.width, cfg.height)
    return
  }

  if (isSixArm) {
    drawSixRoads(ctx, cx, cy, rh, cfg.width, cfg.height)
    return
  }

  // ── Road surfaces ─────────────────────────────────────────────────────────

  // Road asphalt — slightly warmer, lighter premium tone
  ctx.fillStyle = '#1a2230'
  ctx.fillRect(0, cy - rh, cfg.width, rh * 2)
  ctx.fillRect(cx - rh, 0, rh * 2, isTJunction ? cy + rh : cfg.height)
  if (!isTJunction) {
    ctx.fillRect(cx - rh, cy - rh, rh * 2, cfg.height - (cy - rh))
  }

  // Draw curved asphalt slip roads at corners for Free Left
  if (hasFreeLeft) {
    const L = 50
    const corners = [
      { dx: 1, dy: -1, label: 'NE' },
      { dx: -1, dy: -1, label: 'NW' },
      { dx: 1, dy: 1, label: 'SE' },
      { dx: -1, dy: 1, label: 'SW' },
    ]
    corners.forEach((c) => {
      if (isTJunction && (c.label === 'SE' || c.label === 'SW')) return
      const cornerX = cx + c.dx * rh
      const cornerY = cy + c.dy * rh
      ctx.beginPath()
      ctx.moveTo(cornerX, cornerY)
      ctx.lineTo(cornerX, cornerY + c.dy * L)
      ctx.quadraticCurveTo(
        cornerX + c.dx * L, cornerY + c.dy * L,
        cornerX + c.dx * L, cornerY
      )
      ctx.closePath()
      ctx.fill()
    })
  }

  // Intersection box — slightly lighter than road for premium contrast
  ctx.fillStyle = '#1e2a3a'
  ctx.fillRect(cx - rh, cy - rh, rh * 2, rh * 2)

  // KEEP CLEAR diagonal hatch — very subtle yellow, only on non-roundabout
  if (!isRoundabout) drawJunctionHatch(ctx, cx, cy, rh)

  // ── Lane markings ─────────────────────────────────────────────────────────
  // Centre median — double yellow solid lines (N/S road)
  ctx.setLineDash([])
  ctx.strokeStyle = 'rgba(250,204,21,0.65)'
  ctx.lineWidth = 1.5
  for (const sign of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(cx + sign * MEDIAN_PX, 0); ctx.lineTo(cx + sign * MEDIAN_PX, cy - rh)
    if (!isTJunction) {
      ctx.moveTo(cx + sign * MEDIAN_PX, cy + rh); ctx.lineTo(cx + sign * MEDIAN_PX, cfg.height)
    }
    ctx.stroke()
  }
  // Centre median — E/W road
  for (const sign of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(0,       cy + sign * MEDIAN_PX); ctx.lineTo(cx - rh, cy + sign * MEDIAN_PX)
    ctx.moveTo(cx + rh, cy + sign * MEDIAN_PX); ctx.lineTo(cfg.width, cy + sign * MEDIAN_PX)
    ctx.stroke()
  }

  // Inner lane dividers (inner↔middle lane)
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 1
  ctx.setLineDash([14, 10])
  for (const sign of [-1, 1]) {
    // N/S
    ctx.beginPath()
    ctx.moveTo(cx + sign * LANE_DIV_1, 0); ctx.lineTo(cx + sign * LANE_DIV_1, cy - rh)
    if (!isTJunction) {
      ctx.moveTo(cx + sign * LANE_DIV_1, cy + rh); ctx.lineTo(cx + sign * LANE_DIV_1, cfg.height)
    }
    ctx.stroke()
    // E/W
    ctx.beginPath()
    ctx.moveTo(0,       cy + sign * LANE_DIV_1); ctx.lineTo(cx - rh, cy + sign * LANE_DIV_1)
    ctx.moveTo(cx + rh, cy + sign * LANE_DIV_1); ctx.lineTo(cfg.width, cy + sign * LANE_DIV_1)
    ctx.stroke()
  }

  // Outer lane dividers (middle↔outer lane)
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  for (const sign of [-1, 1]) {
    const nLimit = hasFreeLeft ? 110 : rh
    const sLimit = (hasFreeLeft && !isTJunction) ? 110 : rh
    const eLimit = (hasFreeLeft && intersectionType !== 't_junction_free_left') ? 110 : rh
    const wLimit = hasFreeLeft ? 110 : rh

    // N/S
    const limitY1 = sign === 1 ? nLimit : sLimit
    ctx.beginPath()
    ctx.moveTo(cx + sign * LANE_DIV_2, 0); ctx.lineTo(cx + sign * LANE_DIV_2, cy - limitY1)
    if (!isTJunction) {
      ctx.moveTo(cx + sign * LANE_DIV_2, cy + limitY1); ctx.lineTo(cx + sign * LANE_DIV_2, cfg.height)
    }
    ctx.stroke()

    // E/W
    const limitX1 = sign === 1 ? eLimit : wLimit
    ctx.beginPath()
    ctx.moveTo(0,       cy + sign * LANE_DIV_2); ctx.lineTo(cx - limitX1, cy + sign * LANE_DIV_2)
    ctx.moveTo(cx + limitX1, cy + sign * LANE_DIV_2); ctx.lineTo(cfg.width, cy + sign * LANE_DIV_2)
    ctx.stroke()
  }
  ctx.setLineDash([])

  // ── Stop lines (solid white) ───────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(229,231,235,0.9)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  const nLimit = hasFreeLeft ? LANE_DIV_2 : rh
  const sLimit = (hasFreeLeft && !isTJunction) ? LANE_DIV_2 : rh
  const eLimit = (hasFreeLeft && intersectionType !== 't_junction_free_left') ? LANE_DIV_2 : rh
  const wLimit = hasFreeLeft ? LANE_DIV_2 : rh

  // N arm southbound
  ctx.moveTo(cx + MEDIAN_PX, cy - STOP_PX); ctx.lineTo(cx + nLimit, cy - STOP_PX)
  // S arm northbound
  if (!isTJunction) {
    ctx.moveTo(cx - sLimit, cy + STOP_PX); ctx.lineTo(cx - MEDIAN_PX, cy + STOP_PX)
  }
  // E arm westbound
  ctx.moveTo(cx + STOP_PX, cy + MEDIAN_PX); ctx.lineTo(cx + STOP_PX, cy + eLimit)
  // W arm eastbound
  ctx.moveTo(cx - STOP_PX, cy - wLimit); ctx.lineTo(cx - STOP_PX, cy - MEDIAN_PX)
  ctx.stroke()

  // ── Turn arrows in approach lanes ─────────────────────────────────────────
  if (!isRoundabout && !isYJunction && !isSixArm) {
    const ARROW_OFFSET = 22
    // N arm (southbound, heading = Math.PI = pointing south/down)
    const nArrowY = cy - STOP_PX - ARROW_OFFSET
    drawTurnArrow(ctx, cx + MEDIAN_PX + LANE_W_PX * 0.5, nArrowY, Math.PI, 'straight_left')
    drawTurnArrow(ctx, cx + MEDIAN_PX + LANE_W_PX * 1.5, nArrowY, Math.PI, 'straight')
    drawTurnArrow(ctx, cx + MEDIAN_PX + LANE_W_PX * 2.5, nArrowY, Math.PI, 'straight_right')
    // S arm (northbound, heading = 0 = pointing north/up)
    if (!isTJunction) {
      const sArrowY = cy + STOP_PX + ARROW_OFFSET
      drawTurnArrow(ctx, cx - MEDIAN_PX - LANE_W_PX * 0.5, sArrowY, 0, 'straight_left')
      drawTurnArrow(ctx, cx - MEDIAN_PX - LANE_W_PX * 1.5, sArrowY, 0, 'straight')
      drawTurnArrow(ctx, cx - MEDIAN_PX - LANE_W_PX * 2.5, sArrowY, 0, 'straight_right')
    }
    // E arm (westbound, heading = Math.PI/2 = pointing west/left)
    const eArrowX = cx + STOP_PX + ARROW_OFFSET
    drawTurnArrow(ctx, eArrowX, cy + MEDIAN_PX + LANE_W_PX * 0.5, Math.PI / 2, 'straight_left')
    drawTurnArrow(ctx, eArrowX, cy + MEDIAN_PX + LANE_W_PX * 1.5, Math.PI / 2, 'straight')
    drawTurnArrow(ctx, eArrowX, cy + MEDIAN_PX + LANE_W_PX * 2.5, Math.PI / 2, 'straight_right')
    // W arm (eastbound, heading = -Math.PI/2 = pointing east/right)
    const wArrowX = cx - STOP_PX - ARROW_OFFSET
    drawTurnArrow(ctx, wArrowX, cy - MEDIAN_PX - LANE_W_PX * 0.5, -Math.PI / 2, 'straight_left')
    drawTurnArrow(ctx, wArrowX, cy - MEDIAN_PX - LANE_W_PX * 1.5, -Math.PI / 2, 'straight')
    drawTurnArrow(ctx, wArrowX, cy - MEDIAN_PX - LANE_W_PX * 2.5, -Math.PI / 2, 'straight_right')
  }

  // ── Intersection box outline ───────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(cx - rh + 0.5, cy - rh + 0.5, rh * 2 - 1, rh * 2 - 1)

  // ── Kerb edges with corner radius ─────────────────────────────────────────
  ctx.strokeStyle = 'rgba(71,85,105,0.75)'
  ctx.lineWidth   = 1.5
  ctx.setLineDash([])

  if (hasFreeLeft) {
    // Free-left: straight kerbs (island code handles the outer corners)
    const kl_nw = 110
    const kl_ne = 110
    const kl_sw = isTJunction ? rh : 110
    const kl_se = (intersectionType === 't_junction_free_left') ? rh : 110
    const fl: Array<[[number, number], [number, number]]> = [
      [[0, cy - rh], [cx - kl_nw, cy - rh]],
      [[cx + kl_ne, cy - rh], [cfg.width, cy - rh]],
      isTJunction
        ? [[0, cy + rh], [cfg.width, cy + rh]]
        : [[0, cy + rh], [cx - kl_sw, cy + rh]],
      [[cx - rh, 0], [cx - rh, cy - kl_nw]],
      [[cx + rh, 0], [cx + rh, cy - kl_ne]],
    ]
    if (!isTJunction) {
      fl.push(
        [[cx + kl_se, cy + rh], [cfg.width, cy + rh]],
        [[cx - rh, cy + kl_sw], [cx - rh, cfg.height]],
        [[cx + rh, cy + kl_se], [cx + rh, cfg.height]]
      )
    }
    fl.forEach(([[x1, y1], [x2, y2]]) => {
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    })
  } else {
    // Non-free-left: arc-based smooth corner kerbs
    const kerbPath = (pts: [number, number][]) => {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], CORNER_R)
      }
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
      ctx.stroke()
    }
    // NW: west edge → corner → N arm left kerb up
    kerbPath([[0, cy - rh], [cx - rh, cy - rh], [cx - rh, 0]])
    // NE: east edge → corner → N arm right kerb up
    kerbPath([[cfg.width, cy - rh], [cx + rh, cy - rh], [cx + rh, 0]])
    if (isTJunction) {
      // No S arm — south kerb spans full width
      ctx.beginPath(); ctx.moveTo(0, cy + rh); ctx.lineTo(cfg.width, cy + rh); ctx.stroke()
    } else {
      // SW: west edge → corner → S arm left kerb down
      kerbPath([[0, cy + rh], [cx - rh, cy + rh], [cx - rh, cfg.height]])
      // SE: east edge → corner → S arm right kerb down
      kerbPath([[cfg.width, cy + rh], [cx + rh, cy + rh], [cx + rh, cfg.height]])
    }
  }

  // ── Roundabout Island + Ring ──────────────────────────────────────────────
  if (isRoundabout) {
    const rIsland = 40
    const rRing   = 62

    // Ring carriageway asphalt
    ctx.fillStyle = '#1a2230'
    ctx.beginPath()
    ctx.arc(cx, cy, rRing, 0, Math.PI * 2)
    ctx.fill()

    // Ring mid-lane divider (dashed)
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth   = 1
    ctx.setLineDash([8, 8])
    ctx.beginPath()
    ctx.arc(cx, cy, (rIsland + rRing) / 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Yield lines at each arm entry
    ;[0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((armAngle) => {
      const entryDist = rRing + 2
      const perpLen   = ROAD_HALF_PX * 0.6
      const perp      = armAngle + Math.PI / 2
      const ex        = cx + entryDist * Math.cos(armAngle)
      const ey        = cy + entryDist * Math.sin(armAngle)
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth   = 1.5
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(ex - perpLen * Math.cos(perp), ey - perpLen * Math.sin(perp))
      ctx.lineTo(ex + perpLen * Math.cos(perp), ey + perpLen * Math.sin(perp))
      ctx.stroke()
      ctx.setLineDash([])
    })

    // Splitter islands at each arm entry
    ;[0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((armAngle) => {
      const tipX  = cx + (rRing + 6) * Math.cos(armAngle)
      const tipY  = cy + (rRing + 6) * Math.sin(armAngle)
      const perpA = armAngle + Math.PI / 2
      const baseW = MEDIAN_PX + 2
      const baseD = rRing + 22
      const b1x = cx + baseD * Math.cos(armAngle) - baseW * Math.cos(perpA)
      const b1y = cy + baseD * Math.sin(armAngle) - baseW * Math.sin(perpA)
      const b2x = cx + baseD * Math.cos(armAngle) + baseW * Math.cos(perpA)
      const b2y = cy + baseD * Math.sin(armAngle) + baseW * Math.sin(perpA)
      ctx.fillStyle = '#2d3a4a'
      ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(b1x, b1y); ctx.lineTo(b2x, b2y); ctx.closePath(); ctx.fill()
      const sh = 2.5
      ctx.fillStyle = '#1b3a2a'
      ctx.beginPath()
      ctx.moveTo(tipX + sh * Math.cos(armAngle + Math.PI), tipY + sh * Math.sin(armAngle + Math.PI))
      ctx.lineTo(b1x + sh * Math.cos(perpA + Math.PI), b1y + sh * Math.sin(perpA + Math.PI))
      ctx.lineTo(b2x + sh * Math.cos(perpA), b2y + sh * Math.sin(perpA))
      ctx.closePath(); ctx.fill()
    })

    // Ring outer kerb
    ctx.strokeStyle = 'rgba(71,85,105,0.75)'
    ctx.lineWidth   = 1.5
    ctx.beginPath(); ctx.arc(cx, cy, rRing, 0, Math.PI * 2); ctx.stroke()

    // Central island raised kerb
    ctx.fillStyle = '#2d3a4a'
    ctx.beginPath(); ctx.arc(cx, cy, rIsland, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#1b4332'
    ctx.beginPath(); ctx.arc(cx, cy, rIsland - 4, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#475569'
    ctx.lineWidth   = 2
    ctx.beginPath(); ctx.arc(cx, cy, rIsland, 0, Math.PI * 2); ctx.stroke()

    // Clockwise direction arrows at 45°/135°/225°/315° on ring
    const midR = (rIsland + rRing) / 2
    ;[-Math.PI * 0.25, Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25].forEach((a) => {
      const ax = cx + midR * Math.cos(a)
      const ay = cy + midR * Math.sin(a)
      ctx.save()
      ctx.translate(ax, ay)
      ctx.rotate(a + Math.PI / 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth   = 1.5
      ctx.lineCap     = 'round'
      ctx.beginPath()
      ctx.moveTo(-5, 0); ctx.lineTo(5, 0)
      ctx.moveTo(2, -3); ctx.lineTo(5, 0); ctx.lineTo(2, 3)
      ctx.stroke()
      ctx.restore()
    })

    ctx.fillStyle     = 'rgba(250,204,21,0.55)'
    ctx.font          = 'bold 7px monospace'
    ctx.textAlign     = 'center'
    ctx.letterSpacing = '0.08em'
    ctx.fillText('ROTARY', cx, cy + 3)
    ctx.letterSpacing = '0'
  }

  // ── T-junction: raised terminal kerb + U-turn marker ─────────────────────
  if (isTJunction) {
    ctx.fillStyle = '#2d3a4a'
    ctx.fillRect(cx - rh + 4, cy + rh, rh * 2 - 8, 6)
    ctx.strokeStyle = '#475569'
    ctx.lineWidth   = 1
    ctx.strokeRect(cx - rh + 4, cy + rh, rh * 2 - 8, 6)
    const arrowX = cx, arrowY = cy + rh * 0.6
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth   = 1.5
    ctx.lineCap     = 'round'
    ctx.beginPath()
    ctx.moveTo(arrowX + 8, arrowY + 10)
    ctx.lineTo(arrowX + 8, arrowY - 10)
    ctx.arcTo(arrowX + 8, arrowY - 18, arrowX, arrowY - 18, 8)
    ctx.arcTo(arrowX - 8, arrowY - 18, arrowX - 8, arrowY - 10, 8)
    ctx.lineTo(arrowX - 8, arrowY + 10)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(arrowX + 4, arrowY + 8); ctx.lineTo(arrowX + 8, arrowY + 13); ctx.lineTo(arrowX + 12, arrowY + 8)
    ctx.moveTo(arrowX - 4, arrowY + 8); ctx.lineTo(arrowX - 8, arrowY + 13); ctx.lineTo(arrowX - 12, arrowY + 8)
    ctx.stroke()
  }

  // ── Corner Traffic Islands for Free Left ──────────────────────────────────
  if (hasFreeLeft) {
    const L = 50
    const W_slip = 18
    const L_island = L - W_slip
    const corners = [
      { dx: 1, dy: -1, label: 'NE' },
      { dx: -1, dy: -1, label: 'NW' },
      { dx: 1, dy: 1, label: 'SE' },
      { dx: -1, dy: 1, label: 'SW' },
    ]
    
    // Draw slip road asphalt and outer kerbs first
    corners.forEach((c) => {
      if (isTJunction && (c.label === 'SE' || c.label === 'SW')) return

      let sx, sy, ex, ey, osx, osy, oex, oey, ctrl_x, ctrl_y
      // Start coords = lane 2 of approach arm (where vehicle leaves the queue).
      // End coords   = lane 1 of exit arm (middle lane — sits between dashed dividers,
      //                clearly "on the road"; lane 2 = outer fringe looks off-road).
      // Lane 1 lateral = 7.9 world × 5 = 39.5 canvas px from centre.
      if (c.label === 'NE') {
        sx = 60.5;   sy = -110;  ex = 110;   ey = -39.5;
        osx = 71.5;  osy = -110; oex = 110;  oey = -50.5;
        ctrl_x = 110; ctrl_y = -110
      } else if (c.label === 'NW') {
        sx = -110;   sy = -60.5; ex = -39.5; ey = -110;
        osx = -110;  osy = -71.5;oex = -50.5;oey = -110;
        ctrl_x = -110; ctrl_y = -110
      } else if (c.label === 'SE') {
        sx = 110;    sy = 60.5;  ex = 39.5;  ey = 110;
        osx = 110;   osy = 71.5; oex = 50.5; oey = 110;
        ctrl_x = 110; ctrl_y = 110
      } else { // SW
        sx = -60.5;  sy = 110;   ex = -110;  ey = 39.5;
        osx = -71.5; osy = 110;  oex = -110; oey = 50.5;
        ctrl_x = -110; ctrl_y = 110
      }

      // Draw asphalt
      ctx.strokeStyle = '#161c26'
      ctx.lineWidth = LANE_W_PX
      ctx.beginPath()
      ctx.moveTo(cx + sx, cy + sy)
      ctx.quadraticCurveTo(cx + ctrl_x, cy + ctrl_y, cx + ex, cy + ey)
      ctx.stroke()

      // Draw outer kerb
      ctx.strokeStyle = 'rgba(71,85,105,0.7)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(cx + osx, cy + osy)
      ctx.quadraticCurveTo(cx + ctrl_x, cy + ctrl_y, cx + oex, cy + oey)
      ctx.stroke()
    })

    corners.forEach((c) => {
      if (isTJunction && (c.label === 'SE' || c.label === 'SW')) return
      
      const cornerX = cx + c.dx * rh
      const cornerY = cy + c.dy * rh
      
      const margin = 2
      const ax = cornerX + c.dx * margin
      const ay = cornerY + c.dy * (L_island + margin)
      
      const bx = cornerX + c.dx * (L_island + margin)
      const by = cornerY + c.dy * margin
      
      const cx_pt = cornerX + c.dx * margin
      const cy_pt = cornerY + c.dy * margin
      
      // Draw island background (concrete)
      ctx.fillStyle = '#334155'
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(cx_pt, cy_pt)
      ctx.lineTo(bx, by)
      ctx.quadraticCurveTo(
        cornerX + c.dx * (L_island + margin), cornerY + c.dy * (L_island + margin),
        ax, ay
      )
      ctx.closePath()
      ctx.fill()
      
      ctx.strokeStyle = '#475569'
      ctx.lineWidth = 1.5
      ctx.stroke()
      
      // Draw inner turf (green landscape)
      const turfMargin = 3
      const tax = cornerX + c.dx * (margin + turfMargin)
      const tay = cornerY + c.dy * (L_island + margin - turfMargin)
      
      const tbx = cornerX + c.dx * (L_island + margin - turfMargin)
      const tby = cornerY + c.dy * (margin + turfMargin)
      
      const tcx = cornerX + c.dx * (margin + turfMargin)
      const tcy = cornerY + c.dy * (margin + turfMargin)
      
      ctx.fillStyle = '#1b4332'
      ctx.beginPath()
      ctx.moveTo(tax, tay)
      ctx.lineTo(tcx, tcy)
      ctx.lineTo(tbx, tby)
      ctx.quadraticCurveTo(
        cornerX + c.dx * (L_island + margin - turfMargin), cornerY + c.dy * (L_island + margin - turfMargin),
        tax, tay
      )
      ctx.closePath()
      ctx.fill()

      // ── Directional arrow inside the slip road ──────────────────────────
      const x_center = cornerX + c.dx * (L + L_island) * 0.375
      const y_center = cornerY + c.dy * (L + L_island) * 0.375
      
      const isEndToStart = c.label === 'SE' || c.label === 'NW'
      const angle = isEndToStart 
        ? Math.atan2(c.dy, -c.dx) 
        : Math.atan2(-c.dy, c.dx)
      
      ctx.save()
      ctx.translate(x_center, y_center)
      ctx.rotate(angle)
      
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(-4, -3)
      ctx.lineTo(4, 0)
      ctx.lineTo(-4, 3)
      ctx.stroke()
      ctx.restore()
    })
  }

  // ── Free-left slip roads ───────────────────────────────────────────────────
  if (hasFreeLeft && !isRoundabout) {
    drawFreeleftSlip(ctx, cx, cy, rh)
  }

  // ── Indian pedestrian crossings ────────────────────────────────────────────
  if (!isRoundabout && !isYJunction && !isSixArm) {
    const crossArms: ('N' | 'S' | 'E' | 'W')[] = isTJunction
      ? ['N', 'E', 'W']
      : ['N', 'S', 'E', 'W']
    crossArms.forEach(arm => drawZebraCrossing(ctx, cx, cy, rh, arm))
  }

  // ── Arm direction labels ──────────────────────────────────────────────────
  ctx.font = 'bold 11px monospace'
  ctx.letterSpacing = '0.12em'
  ctx.fillStyle = 'rgba(148,163,184,0.55)'
  ctx.textAlign = 'center'
  ctx.fillText('NORTH', cx, 18)
  if (!isTJunction) {
    ctx.fillText('SOUTH', cx, cfg.height - 8)
  }
  ctx.save()
  ctx.translate(14, cy)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText('WEST', 0, 4)
  ctx.restore()
  ctx.save()
  ctx.translate(cfg.width - 14, cy)
  ctx.rotate(Math.PI / 2)
  ctx.fillText('EAST', 0, 4)
  ctx.restore()
  ctx.letterSpacing = '0'

  // ── Lane index labels ─────────────────────────────────────────────────────
  const LABEL_COLOR = 'rgba(71,85,105,0.85)'
  ctx.font = '8px monospace'
  ctx.textAlign = 'center'
  const laneCenter = (idx: number) => MEDIAN_PX + LANE_W_PX * idx + LANE_W_PX / 2

  // N arm
  for (let i = 0; i < 3; i++) {
    const laneX = cx + laneCenter(i)
    for (const frac of [0.33, 0.67]) {
      const laneY = cy - rh - (cy - rh) * frac
      ctx.fillStyle = LABEL_COLOR
      ctx.fillText(`N${i + 1}`, laneX, laneY)
    }
  }
  // S arm
  if (!isTJunction) {
    for (let i = 0; i < 3; i++) {
      const laneX = cx - laneCenter(i)
      for (const frac of [0.33, 0.67]) {
        const laneY = cy + rh + (cfg.height - cy - rh) * frac
        ctx.fillStyle = LABEL_COLOR
        ctx.fillText(`S${i + 1}`, laneX, laneY)
      }
    }
  }
  // W arm
  for (let i = 0; i < 3; i++) {
    const laneY = cy - laneCenter(i)
    for (const frac of [0.33, 0.67]) {
      const laneX = cx - rh - (cx - rh) * frac
      ctx.fillStyle = LABEL_COLOR
      ctx.fillText(`W${i + 1}`, laneX, laneY)
    }
  }
  // E arm
  for (let i = 0; i < 3; i++) {
    const laneY = cy + laneCenter(i)
    for (const frac of [0.33, 0.67]) {
      const laneX = cx + rh + (cfg.width - cx - rh) * frac
      ctx.fillStyle = LABEL_COLOR
      ctx.fillText(`E${i + 1}`, laneX, laneY)
    }
  }
}

// ── Traffic Signals ──────────────────────────────────────────────────────────

function _armSignalState(arm: string, phase: number): 'red' | 'yellow' | 'green' {
  if (phase === 0) {
    return (arm === 'N' || arm === 'S') ? 'green' : 'red'
  }
  if (phase === 1) {
    return (arm === 'N' || arm === 'S') ? 'yellow' : 'red'
  }
  if (phase === 2) {
    return (arm === 'E' || arm === 'W') ? 'green' : 'red'
  }
  if (phase === 3) {
    return (arm === 'E' || arm === 'W') ? 'yellow' : 'red'
  }
  return 'red'
}

function _signalHead(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  state: 'red' | 'yellow' | 'green',
  elapsed = 0
): void {
  const hw = 9, hh = 28, br = 5

  // Matte flat housing — no gradient, no drop shadow
  rr(ctx, px - hw, py - hh, hw * 2, hh * 2, 4)
  ctx.fillStyle = '#10151e'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  ctx.stroke()

  const LIT:  Record<string, string> = { red: '#ef4444', yellow: '#facc15', green: '#22c55e' }
  const DARK: Record<string, string> = { red: '#2a1414', yellow: '#2a2410', green: '#13251a' }

  ;[
    { dy: -hh + 9,  name: 'red'    as const },
    { dy: 0,        name: 'yellow' as const },
    { dy:  hh - 9,  name: 'green'  as const },
  ].forEach(({ dy, name }) => {
    const lit = state === name
    ctx.beginPath()
    ctx.arc(px, py + dy, br, 0, Math.PI * 2)
    ctx.fillStyle = lit ? LIT[name] : DARK[name]
    ctx.fill()
    // Thin matte ring around lit bulb instead of a glow
    if (lit) {
      ctx.strokeStyle = LIT[name]
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, py + dy, br + 1.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  })

  ctx.fillStyle = 'rgba(8,12,18,0.9)'
  rr(ctx, px - hw, py + hh + 2, hw * 2, 12, 2)
  ctx.fill()
  ctx.fillStyle = state === 'red' ? '#ef4444' : state === 'yellow' ? '#facc15' : '#22c55e'
  ctx.font = 'bold 8px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`${Math.round(elapsed)}s`, px, py + hh + 11)
}

function _signalHeadH(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  state: 'red' | 'yellow' | 'green',
  elapsed = 0
): void {
  const hh = 9, hw = 28, br = 5

  // Matte flat housing
  rr(ctx, px - hw, py - hh, hw * 2, hh * 2, 4)
  ctx.fillStyle = '#10151e'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  ctx.stroke()

  const LIT:  Record<string, string> = { red: '#ef4444', yellow: '#facc15', green: '#22c55e' }
  const DARK: Record<string, string> = { red: '#2a1414', yellow: '#2a2410', green: '#13251a' }

  ;[
    { dx: -hw + 9, name: 'red'    as const },
    { dx: 0,       name: 'yellow' as const },
    { dx:  hw - 9, name: 'green'  as const },
  ].forEach(({ dx, name }) => {
    const lit = state === name
    ctx.beginPath()
    ctx.arc(px + dx, py, br, 0, Math.PI * 2)
    ctx.fillStyle = lit ? LIT[name] : DARK[name]
    ctx.fill()
    if (lit) {
      ctx.strokeStyle = LIT[name]
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px + dx, py, br + 1.5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  })

  ctx.fillStyle = 'rgba(8,12,18,0.9)'
  rr(ctx, px - hw, py + hh + 2, hw * 2, 12, 2)
  ctx.fill()
  ctx.fillStyle = state === 'red' ? '#ef4444' : state === 'yellow' ? '#facc15' : '#22c55e'
  ctx.font = 'bold 8px monospace'
  ctx.textAlign = 'center'
  ctx.fillText(`${Math.round(elapsed)}s`, px, py + hh + 11)
}

// Draw a compact arm info chip: signal dot + arm label + vehicle count
function _drawArmInfo(
  ctx: CanvasRenderingContext2D,
  arm: string,
  count: number,
  cx: number, cy: number,
  state: 'red' | 'yellow' | 'green'
): void {
  const stateColor = state === 'green' ? '#4ade80' : state === 'yellow' ? '#fbbf24' : '#f87171'
  const text = `${arm}  ${count} veh`
  ctx.font = 'bold 9px monospace'
  const tw = ctx.measureText(text).width
  const bw = tw + 22, bh = 16, br = 4

  ctx.fillStyle = 'rgba(6,9,14,0.92)'
  rr(ctx, cx - bw / 2, cy - bh / 2, bw, bh, br)
  ctx.fill()
  ctx.strokeStyle = `${stateColor}35`
  ctx.lineWidth = 1
  rr(ctx, cx - bw / 2, cy - bh / 2, bw, bh, br)
  ctx.stroke()

  // State dot (matte, no glow)
  ctx.fillStyle = stateColor
  ctx.beginPath(); ctx.arc(cx - bw / 2 + 8, cy, 3, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = 'rgba(203,213,225,0.9)'
  ctx.textAlign = 'left'
  ctx.fillText(text, cx - bw / 2 + 14, cy + 3)
}

export function drawTrafficSignals(
  ctx: CanvasRenderingContext2D,
  signals: SignalState[],
  cfg: RenderConfig,
  vehicles?: VehicleFrame[],
  intersectionType: string = "four_way"
): void {
  if (!signals.length) return
  const phase   = signals[0].phase
  const elapsed = signals[0].elapsed_s ?? 0
  const cx = cfg.offsetX, cy = cfg.offsetY
  const rh = ROAD_HALF_PX
  const off = 10  // gap between road edge and signal post
  const isTJunction = intersectionType === 't_junction' || intersectionType === 't_junction_free_left'

  const nCount = vehicles ? vehicles.filter(v => v.arm === 'N').length : 0
  const sCount = vehicles ? vehicles.filter(v => v.arm === 'S').length : 0
  const eCount = vehicles ? vehicles.filter(v => v.arm === 'E').length : 0
  const wCount = vehicles ? vehicles.filter(v => v.arm === 'W').length : 0

  const drawPole = (fx: number, fy: number, tx: number, ty: number) => {
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 1.5
    ctx.setLineDash([])
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke()
    ctx.fillStyle = '#2d3748'
    ctx.fillRect(tx - 3, ty - 2, 6, 4)
  }

  const nState = _armSignalState('N', phase)
  const sState = _armSignalState('S', phase)
  const eState = _armSignalState('E', phase)
  const wState = _armSignalState('W', phase)

  // N arm signal — at stop line, east kerb side, vertical head
  const ne = { px: cx + rh + off + 9, py: cy - STOP_PX - 28 }
  drawPole(cx + rh, cy - STOP_PX, ne.px, ne.py + 28)
  _signalHead(ctx, ne.px, ne.py, nState, elapsed)
  _drawArmInfo(ctx, 'NORTH', nCount, cx, 22, nState)

  // S arm signal — at stop line, west kerb side, vertical head
  if (!isTJunction) {
    const sw = { px: cx - rh - off - 9, py: cy + STOP_PX + 28 }
    drawPole(cx - rh, cy + STOP_PX, sw.px, sw.py - 28)
    _signalHead(ctx, sw.px, sw.py, sState, elapsed)
    _drawArmInfo(ctx, 'SOUTH', sCount, cx, cfg.height - 16, sState)
  }

  // E arm signal — at stop line, south kerb side, horizontal head
  const se = { px: cx + STOP_PX + 28, py: cy + rh + off + 9 }
  drawPole(cx + STOP_PX, cy + rh, se.px - 28, se.py)
  _signalHeadH(ctx, se.px, se.py, eState, elapsed)
  _drawArmInfo(ctx, 'EAST', eCount, cfg.width - 58, cy, eState)

  // W arm signal — at stop line, north kerb side, horizontal head
  const nw = { px: cx - STOP_PX - 28, py: cy - rh - off - 9 }
  drawPole(cx - STOP_PX, cy - rh, nw.px + 28, nw.py)
  _signalHeadH(ctx, nw.px, nw.py, wState, elapsed)
  _drawArmInfo(ctx, 'WEST', wCount, 58, cy, wState)
}

// ── Vehicles ─────────────────────────────────────────────────────────────────

export function drawPedestrian(
  ctx: CanvasRenderingContext2D,
  ped: { id: string; x: number; y: number; state: string; compliant: boolean },
  cfg: RenderConfig
): void {
  const [px, py] = worldToCanvas(ped.x, ped.y, cfg)
  const color =
    (ped.state === 'crossing_1' || ped.state === 'crossing_2')
      ? (ped.compliant ? '#06b6d4' : '#ef4444')
      : '#f59e0b'
  ctx.save()
  ctx.globalAlpha = 0.9
  // Outer glow
  ctx.shadowColor = color
  ctx.shadowBlur = 4
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(px, py, 4.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowBlur = 0
  // White center
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.beginPath()
  ctx.arc(px, py, 1.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function drawVehicle(
  ctx: CanvasRenderingContext2D,
  vehicle: VehicleFrame,
  cfg: RenderConfig,
  alpha = 1.0
): void {
  const [vx, vy]    = worldToCanvas(vehicle.x, vehicle.y, cfg)
  const color        = VEHICLE_COLORS[vehicle.type_id] ?? '#94a3b8'
  const [dimL, dimW] = VEHICLE_DIMS[vehicle.type_id] ?? [3.8, 1.8]
  const bL           = dimL * cfg.scale
  const bW           = Math.min(dimW * cfg.scale, LANE_W_PX - 4)
  const angle        = vehicle.angle !== undefined ? vehicle.angle : (ARM_ANGLE[vehicle.arm] ?? 0)
  const stopped      = vehicle.speed < 0.5
  const cr           = Math.min(2.5, bW * 0.2)

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(vx, vy)
  ctx.rotate(angle)

  // Matte body — flat solid fill, no gloss/sheen
  ctx.fillStyle = color
  rr(ctx, -bL / 2, -bW / 2, bL, bW, cr)
  ctx.fill()

  // Thin darker outline for crisp separation between adjacent vehicles
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'
  ctx.lineWidth = 0.75
  rr(ctx, -bL / 2, -bW / 2, bL, bW, cr)
  ctx.stroke()

  // Flat front cap — direction indicator (no glow)
  ctx.fillStyle = stopped ? 'rgba(255,210,80,0.7)' : 'rgba(255,255,255,0.4)'
  ctx.fillRect(bL * 0.40, -bW * 0.36, bL * 0.08, bW * 0.72)

  // Flat rear cap — solid red when braking, dim otherwise (no glow)
  ctx.fillStyle = stopped ? 'rgba(239,68,68,0.9)' : 'rgba(120,30,30,0.55)'
  ctx.fillRect(-bL * 0.48, -bW * 0.36, bL * 0.07, bW * 0.72)

  // Bus / truck body segments (flat seams)
  if (vehicle.type_id === 'tsrtc_bus' || vehicle.type_id === 'school_bus' || vehicle.type_id === 'truck') {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = 0.75
    const segs = vehicle.type_id === 'truck' ? 3 : 4
    for (let i = 1; i < segs; i++) {
      const rx = -bL / 2 + (bL / segs) * i
      ctx.beginPath(); ctx.moveTo(rx, -bW / 2 + 1.5); ctx.lineTo(rx, bW / 2 - 1.5); ctx.stroke()
    }
  }

  ctx.restore()
}

export function drawVehicleTrail(
  ctx: CanvasRenderingContext2D,
  frames: VehicleFrame[][],
  cfg: RenderConfig
): void {
  if (frames.length < 2) return
  ctx.save()
  frames.forEach((fv, fi) => {
    fv.forEach((v) => {
      const [x, y] = worldToCanvas(v.x, v.y, cfg)
      ctx.globalAlpha = (fi / frames.length) * 0.15
      ctx.fillStyle = VEHICLE_COLORS[v.type_id] ?? '#fff'
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill()
    })
  })
  ctx.restore()
}

// ── HUD overlays ──────────────────────────────────────────────────────────────

export function drawSignalIndicator(
  ctx: CanvasRenderingContext2D,
  signal: SignalState,
  cfg: RenderConfig
): void {
  const color = PHASE_COLORS[signal.phase] ?? '#fff'
  const names = ['N-S Green', 'N-S Yellow', 'E-W Green', 'E-W Yellow', 'All Red']
  const name  = names[signal.phase] ?? `Phase ${signal.phase}`
  // Bottom-left corner — avoids colliding with the centered model badge + top speed bar
  const bx = 10, by = cfg.height - 38

  ctx.fillStyle = 'rgba(8,12,18,0.92)'
  rr(ctx, bx, by, 132, 28, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  rr(ctx, bx, by, 132, 28, 6)
  ctx.stroke()

  // Matte state dot (no glow)
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(bx + 11, by + 14, 4, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = color
  ctx.font = 'bold 9px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(name, bx + 22, by + 11)
  ctx.fillStyle = 'rgba(148,163,184,0.85)'
  ctx.font = '8px monospace'
  ctx.fillText(`${signal.elapsed_s.toFixed(1)}s  ·  ${signal.remaining_s?.toFixed(0) ?? '?'}s left`, bx + 22, by + 22)
}

export function drawAdverseOverlay(
  ctx: CanvasRenderingContext2D,
  events: AdverseEvent[],
  cfg: RenderConfig
): void {
  if (!events.length) return
  events.forEach((ev) => {
    if (ev.severity > 0.5) {
      ctx.save()
      ctx.strokeStyle = `rgba(239,68,68,${ev.severity * 0.6})`
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, cfg.width - 4, cfg.height - 4)
      ctx.restore()
    }
    ctx.fillStyle = `rgba(239,68,68,${0.7 + ev.severity * 0.3})`
    ctx.font = 'bold 10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`! ${ev.event_type.replace(/_/g, ' ')}`, 10, cfg.height - 10)
  })
}

export function drawStats(
  ctx: CanvasRenderingContext2D,
  frame: { vehicles: VehicleFrame[]; sim_time_s: number },
  cfg: RenderConfig
): void {
  const waiting = frame.vehicles.filter((v) => v.speed < 0.5).length
  const moving  = frame.vehicles.length - waiting

  ctx.fillStyle = 'rgba(8,12,18,0.90)'
  rr(ctx, 6, 6, 168, 52, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  rr(ctx, 6, 6, 168, 52, 6)
  ctx.stroke()

  const hrs = Math.floor(frame.sim_time_s / 3600)
  const mm = Math.floor((frame.sim_time_s % 3600) / 60).toString().padStart(2, '0')
  const ss = Math.floor(frame.sim_time_s % 60).toString().padStart(2, '0')
  const hh = hrs.toString().padStart(2, '0')

  ctx.fillStyle = '#8fb8ce'
  ctx.font = 'bold 11px monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`t = ${hh}:${mm}:${ss}`, 16, 24)

  ctx.fillStyle = 'rgba(148,163,184,0.8)'
  ctx.font = '9px monospace'
  ctx.fillText(`Moving   ${moving.toString().padStart(3)}  ·  Waiting  ${waiting.toString().padStart(3)}`, 16, 38)

  // Mini flow bar
  const total = frame.vehicles.length
  const barW = 150, barH = 3
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(14, 46, barW, barH)
  if (total > 0) {
    ctx.fillStyle = moving > waiting ? '#4ade80' : '#f87171'
    ctx.fillRect(14, 46, barW * (moving / total), barH)
  }
}
