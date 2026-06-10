# Road Layout Realism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the canvas intersection renderer so every layout type (4-way, T-junction, Y-junction, 6-arm, roundabout, free-left variants) looks like a real-world road with sidewalks, curved kerb corners, lane arrows, junction hatch, and a realistic roundabout ring.

**Architecture:** All changes are confined to `frontend/src/canvas/renderer.ts`. The `drawIntersection()` function is reorganised into focused helpers; all existing call-sites (SimCanvas, SplitCanvas) are unchanged because the function signature stays identical. Backend simulation is unaffected — intersection type already maps to SUMO templates.

**Tech Stack:** TypeScript, HTML5 Canvas 2D API, React (Vite dev server for visual verification)

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/canvas/renderer.ts` | Only file changed. Rewrite intersection drawing; keep vehicle/signal/HUD functions intact. |

---

### Task 1: Add constants and footpath background

**Files:**
- Modify: `frontend/src/canvas/renderer.ts:45-52` (constants block)
- Modify: `frontend/src/canvas/renderer.ts:242` (start of `drawIntersection`)

- [ ] **Step 1: Add two new layout constants right after `STOP_PX`**

In `renderer.ts`, after line 51 (`const STOP_PX = 99`), add:

```typescript
const CORNER_R  = 14   // kerb corner radius at intersection arm entries
const FOOTPATH  = '#0d1520'   // sidewalk / footpath surface colour
```

- [ ] **Step 2: Make `drawIntersection` paint footpath background before road surfaces**

At the very top of `drawIntersection`, right after the `const` declarations for `isTJunction / isYJunction / isSixArm / isRoundabout / hasFreeLeft`, add:

```typescript
  // Footpath base — covers the whole canvas; road surfaces are drawn on top
  ctx.fillStyle = FOOTPATH
  ctx.fillRect(0, 0, cfg.width, cfg.height)
```

This replaces the old implicit `#080c12` background with a visible footpath tone.

- [ ] **Step 3: Visual check — start dev server**

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`. Load the Dashboard, switch to any layout. The corner triangles where road arms don't overlap should now appear as a slightly lighter `#0d1520` slate instead of pure black. Road surface should still be darker `#1a2230` — making the footpath clearly visible.

- [ ] **Step 4: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ built in` with no TypeScript errors.

---

### Task 2: Add `drawTurnArrow` helper

**Files:**
- Modify: `frontend/src/canvas/renderer.ts` — insert new function before `drawIntersection`

- [ ] **Step 1: Insert the helper after `drawZebraCrossing` (around line 240)**

```typescript
// ── Turn arrows (painted road markings) ─────────────────────────────────────
function drawTurnArrow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  heading: number, // radians; 0 = pointing south (↓), PI/2 = pointing west (←)
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
    ctx.moveTo(ex - HEAD, ey)
    ctx.lineTo(ex, ey - HEAD)
    ctx.lineTo(ex, ey + HEAD * 0.5)
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
    ctx.moveTo(ex + HEAD, ey)
    ctx.lineTo(ex, ey - HEAD)
    ctx.lineTo(ex, ey + HEAD * 0.5)
    ctx.stroke()
  }

  if (type === 'straight')       shaft()
  if (type === 'right')          rightArc(0)
  if (type === 'left')           leftArc(0)
  if (type === 'straight_right') { shaft(); rightArc(4) }
  if (type === 'straight_left')  { shaft(); leftArc(-4) }

  ctx.restore()
}
```

- [ ] **Step 2: Build check**

```bash
npm run build 2>&1 | tail -5
```

Expected: no TypeScript errors.

---

### Task 3: Add `drawJunctionHatch` helper

**Files:**
- Modify: `frontend/src/canvas/renderer.ts` — insert after `drawTurnArrow`

- [ ] **Step 1: Insert the helper**

```typescript
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
```

- [ ] **Step 2: Call it inside `drawIntersection`**

Inside `drawIntersection`, immediately after the intersection-box fill (`ctx.fillRect(cx - rh, cy - rh, rh * 2, rh * 2)`), add:

```typescript
  // KEEP CLEAR diagonal hatch — very subtle
  if (!isRoundabout) drawJunctionHatch(ctx, cx, cy, rh)
```

- [ ] **Step 3: Visual check**

In the browser, select "4-Way Cross" layout. The intersection box should now have very faint yellow diagonal stripes (like a real "keep clear" box junction marking). Should be subtle — barely noticeable until you look closely.

---

### Task 4: Curved kerb corners for 4-way and T-junction

**Files:**
- Modify: `frontend/src/canvas/renderer.ts` — replace the `kerbLines` array + `forEach` block with arc-based paths

- [ ] **Step 1: Find and replace the existing kerb drawing block**

Locate the block that starts with:
```typescript
  const kerbLines: Array<[[number, number], [number, number]]> = [
```
and ends with:
```typescript
  kerbLines.forEach(([[x1, y1], [x2, y2]]) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  })
```

Replace the entire block with:

```typescript
  // ── Kerb edges with corner radius ─────────────────────────────────────────
  ctx.strokeStyle = 'rgba(71,85,105,0.75)'
  ctx.lineWidth   = 1.5
  ctx.setLineDash([])

  const CR = hasFreeLeft ? 0 : CORNER_R   // free-left handles its own corners

  // helper: draw one connected kerb path using arcTo for smooth corners
  const kerbPath = (pts: [number, number][], closed = false) => {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], CR)
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
    if (closed) ctx.closePath()
    ctx.stroke()
  }

  // NW outer corner — from west edge along top of E-W road, around corner, up N arm left kerb
  kerbPath([[0, cy - rh], [cx - rh, cy - rh], [cx - rh, 0]])
  // NE outer corner — from east edge along top of E-W road, around corner, up N arm right kerb
  kerbPath([[cfg.width, cy - rh], [cx + rh, cy - rh], [cx + rh, 0]])

  if (isTJunction) {
    // SW/SE: straight south kerb spans full width (no S arm — just a flat line)
    ctx.beginPath()
    ctx.moveTo(0, cy + rh)
    ctx.lineTo(cfg.width, cy + rh)
    ctx.stroke()
  } else {
    // SW outer corner — from west edge along bottom, around corner, down S arm left kerb
    kerbPath([[0, cy + rh], [cx - rh, cy + rh], [cx - rh, cfg.height]])
    // SE outer corner — from east edge along bottom, around corner, down S arm right kerb
    kerbPath([[cfg.width, cy + rh], [cx + rh, cy + rh], [cx + rh, cfg.height]])
  }
```

- [ ] **Step 2: Visual check**

In the browser, the four corners of the intersection where road arms start should now show smoothly rounded kerb lines instead of sharp 90-degree corners. T-junction should show a flat bottom kerb across the full width.

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | tail -5
```

---

### Task 5: Turn arrows in approach lanes

**Files:**
- Modify: `frontend/src/canvas/renderer.ts` — add arrow drawing inside `drawIntersection` after stop lines

- [ ] **Step 1: Add turn arrow calls after the stop-line block**

After the stop lines `ctx.stroke()` call but before the intersection box outline, insert:

```typescript
  // ── Turn arrows in approach lanes ─────────────────────────────────────────
  if (!isRoundabout && !isYJunction && !isSixArm) {
    // Arrow placement: 20px inside the stop line (toward the approaching vehicle)
    const ARROW_OFFSET = 22  // px back from stop line

    // N arm: southbound traffic — east side of road (positive x lanes)
    const nArrowY = cy - STOP_PX - ARROW_OFFSET
    drawTurnArrow(ctx, cx + MEDIAN_PX + LANE_W_PX * 0.5,              nArrowY, 0, 'straight_left')
    drawTurnArrow(ctx, cx + MEDIAN_PX + LANE_W_PX * 1.5,              nArrowY, 0, 'straight')
    drawTurnArrow(ctx, cx + MEDIAN_PX + LANE_W_PX * 2.5,              nArrowY, 0, 'straight_right')

    // S arm: northbound traffic — west side of road (negative x lanes) — heading = PI (pointing north = up)
    if (!isTJunction) {
      const sArrowY = cy + STOP_PX + ARROW_OFFSET
      drawTurnArrow(ctx, cx - MEDIAN_PX - LANE_W_PX * 0.5,            sArrowY, Math.PI, 'straight_left')
      drawTurnArrow(ctx, cx - MEDIAN_PX - LANE_W_PX * 1.5,            sArrowY, Math.PI, 'straight')
      drawTurnArrow(ctx, cx - MEDIAN_PX - LANE_W_PX * 2.5,            sArrowY, Math.PI, 'straight_right')
    }

    // E arm: westbound traffic — south side of road (positive y lanes) — heading = PI/2 (pointing west = left)
    const eArrowX = cx + STOP_PX + ARROW_OFFSET
    drawTurnArrow(ctx, eArrowX, cy + MEDIAN_PX + LANE_W_PX * 0.5,     Math.PI / 2, 'straight_left')
    drawTurnArrow(ctx, eArrowX, cy + MEDIAN_PX + LANE_W_PX * 1.5,     Math.PI / 2, 'straight')
    drawTurnArrow(ctx, eArrowX, cy + MEDIAN_PX + LANE_W_PX * 2.5,     Math.PI / 2, 'straight_right')

    // W arm: eastbound traffic — north side of road (negative y lanes) — heading = -PI/2 (pointing east = right)
    const wArrowX = cx - STOP_PX - ARROW_OFFSET
    drawTurnArrow(ctx, wArrowX, cy - MEDIAN_PX - LANE_W_PX * 0.5,    -Math.PI / 2, 'straight_left')
    drawTurnArrow(ctx, wArrowX, cy - MEDIAN_PX - LANE_W_PX * 1.5,    -Math.PI / 2, 'straight')
    drawTurnArrow(ctx, wArrowX, cy - MEDIAN_PX - LANE_W_PX * 2.5,    -Math.PI / 2, 'straight_right')
  }
```

- [ ] **Step 2: Visual check**

Each approach lane should now display small white painted arrows:
- Inner lane (adjacent to median): straight + left arrow
- Middle lane: straight arrow only
- Outer lane: straight + right arrow

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | tail -5
```

---

### Task 6: Improved roundabout

**Files:**
- Modify: `frontend/src/canvas/renderer.ts` — replace the roundabout section inside `drawIntersection`

- [ ] **Step 1: Find the current roundabout block**

Find the block starting with:
```typescript
  // ── Roundabout Central Island ─────────────────────────────────────────────
  if (isRoundabout) {
```
and ending with the closing `}`.

Replace the entire block with:

```typescript
  // ── Roundabout Central Island + Ring ─────────────────────────────────────
  if (isRoundabout) {
    const rIsland = 40   // central island outer radius
    const rRing   = 62   // outer edge of ring carriageway

    // Ring carriageway asphalt (annular region)
    ctx.fillStyle = '#1a2230'
    ctx.beginPath()
    ctx.arc(cx, cy, rRing, 0, Math.PI * 2)
    ctx.fill()

    // Ring lane divider (dashed white mid-ring circle)
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth   = 1
    ctx.setLineDash([8, 8])
    ctx.beginPath()
    ctx.arc(cx, cy, (rIsland + rRing) / 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])

    // Yield lines at each arm entry — short dashed perpendicular bars
    const yieldArms: [number, string][] = [
      [0, 'E'], [Math.PI / 2, 'S'], [Math.PI, 'W'], [-Math.PI / 2, 'N'],
    ]
    yieldArms.forEach(([armAngle]) => {
      const entryDist = rRing + 2
      const perpLen = ROAD_HALF_PX * 0.6
      const perp    = armAngle + Math.PI / 2
      const ex      = cx + entryDist * Math.cos(armAngle)
      const ey      = cy + entryDist * Math.sin(armAngle)
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth   = 1.5
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(ex - perpLen * Math.cos(perp), ey - perpLen * Math.sin(perp))
      ctx.lineTo(ex + perpLen * Math.cos(perp), ey + perpLen * Math.sin(perp))
      ctx.stroke()
      ctx.setLineDash([])
    })

    // Splitter islands — small triangular refuges at each arm (between entry/exit lanes)
    ;[0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((armAngle) => {
      const tipX  = cx + (rRing + 6) * Math.cos(armAngle)
      const tipY  = cy + (rRing + 6) * Math.sin(armAngle)
      const perpA = armAngle + Math.PI / 2
      const baseW = MEDIAN_PX + 2
      const baseD = rRing + 22
      const b1x   = cx + baseD * Math.cos(armAngle) - baseW * Math.cos(perpA)
      const b1y   = cy + baseD * Math.sin(armAngle) - baseW * Math.sin(perpA)
      const b2x   = cx + baseD * Math.cos(armAngle) + baseW * Math.cos(perpA)
      const b2y   = cy + baseD * Math.sin(armAngle) + baseW * Math.sin(perpA)
      // Island base (raised concrete)
      ctx.fillStyle = '#2d3a4a'
      ctx.beginPath()
      ctx.moveTo(tipX, tipY)
      ctx.lineTo(b1x, b1y)
      ctx.lineTo(b2x, b2y)
      ctx.closePath()
      ctx.fill()
      // Island turf
      ctx.fillStyle = '#1b3a2a'
      const shrink = 2.5
      const tb1x = tipX + shrink * Math.cos(armAngle + Math.PI)
      const tb1y = tipY + shrink * Math.sin(armAngle + Math.PI)
      ctx.beginPath()
      ctx.moveTo(tb1x, tb1y)
      ctx.lineTo(b1x + shrink * Math.cos(perpA + Math.PI), b1y + shrink * Math.sin(perpA + Math.PI))
      ctx.lineTo(b2x + shrink * Math.cos(perpA), b2y + shrink * Math.sin(perpA))
      ctx.closePath()
      ctx.fill()
    })

    // Ring outer kerb
    ctx.strokeStyle = 'rgba(71,85,105,0.75)'
    ctx.lineWidth   = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, rRing, 0, Math.PI * 2)
    ctx.stroke()

    // Central island raised kerb ring
    ctx.fillStyle = '#2d3a4a'
    ctx.beginPath()
    ctx.arc(cx, cy, rIsland, 0, Math.PI * 2)
    ctx.fill()

    // Central island green surface
    ctx.fillStyle = '#1b4332'
    ctx.beginPath()
    ctx.arc(cx, cy, rIsland - 4, 0, Math.PI * 2)
    ctx.fill()

    // Inner kerb line
    ctx.strokeStyle = '#475569'
    ctx.lineWidth   = 2
    ctx.beginPath()
    ctx.arc(cx, cy, rIsland, 0, Math.PI * 2)
    ctx.stroke()

    // Clockwise direction arrows at 45°, 135°, 225°, 315° on ring
    const midR = (rIsland + rRing) / 2
    ;[-Math.PI * 0.25, Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25].forEach((a) => {
      const ax = cx + midR * Math.cos(a)
      const ay = cy + midR * Math.sin(a)
      const tangent = a + Math.PI / 2  // clockwise tangent
      ctx.save()
      ctx.translate(ax, ay)
      ctx.rotate(tangent)
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth   = 1.5
      ctx.lineCap     = 'round'
      ctx.beginPath()
      ctx.moveTo(-5, 0); ctx.lineTo(5, 0)           // shaft
      ctx.moveTo(2, -3); ctx.lineTo(5, 0); ctx.lineTo(2, 3)  // head
      ctx.stroke()
      ctx.restore()
    })

    // Centre label
    ctx.fillStyle   = 'rgba(250,204,21,0.55)'
    ctx.font        = 'bold 7px monospace'
    ctx.textAlign   = 'center'
    ctx.letterSpacing = '0.08em'
    ctx.fillText('ROTARY', cx, cy + 3)
    ctx.letterSpacing = '0'
  }
```

- [ ] **Step 2: Visual check**

Switch to "Roundabout" layout. You should see:
- A larger green central island (radius 40)
- Ring carriageway with a dashed mid-ring divider
- Small triangular splitter islands at each arm entry
- Dotted yield lines at each arm entry
- Four small clockwise direction arrows on the ring
- "ROTARY" label on the island

- [ ] **Step 3: Build check**

```bash
npm run build 2>&1 | tail -5
```

---

### Task 7: Improved Y-junction

**Files:**
- Modify: `frontend/src/canvas/renderer.ts` — rewrite `drawYRoad`

- [ ] **Step 1: Replace the entire `drawYRoad` function**

```typescript
function drawYRoad(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  rh: number,
  width: number, height: number
): void {
  const len  = Math.max(width, height) * 1.1
  const arms = [
    { angle: -Math.PI / 2,               label: 'NORTH' },
    { angle: -Math.PI / 2 + (2 * Math.PI / 3), label: 'SE'    },
    { angle: -Math.PI / 2 - (2 * Math.PI / 3), label: 'SW'    },
  ]

  // ── Footpath base ─────────────────────────────────────────────────────────
  ctx.fillStyle = FOOTPATH
  ctx.fillRect(0, 0, width, height)

  // ── Road arms ─────────────────────────────────────────────────────────────
  arms.forEach(({ angle }) => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)

    // Asphalt
    ctx.fillStyle = '#1a2230'
    ctx.fillRect(0, -rh, len, rh * 2)

    // Kerb lines
    ctx.strokeStyle = 'rgba(71,85,105,0.75)'
    ctx.lineWidth   = 1.5
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(0, -rh); ctx.lineTo(len, -rh)
    ctx.moveTo(0,  rh); ctx.lineTo(len,  rh)
    ctx.stroke()

    // Centre median (double yellow)
    ctx.strokeStyle = 'rgba(250,204,21,0.60)'
    ctx.lineWidth   = 1.5
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, s * MEDIAN_PX); ctx.lineTo(len, s * MEDIAN_PX)
      ctx.stroke()
    }

    // Lane divider (dashed white, 2 lanes each direction)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth   = 1
    ctx.setLineDash([12, 10])
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, s * LANE_DIV_1); ctx.lineTo(len, s * LANE_DIV_1)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Stop line
    ctx.strokeStyle = 'rgba(229,231,235,0.85)'
    ctx.lineWidth   = 2.5
    ctx.beginPath()
    ctx.moveTo(STOP_PX, MEDIAN_PX); ctx.lineTo(STOP_PX, rh)
    ctx.stroke()

    ctx.restore()
  })

  // ── Central junction polygon (filled hexagon connecting the 3 arms) ────────
  ctx.fillStyle = '#1e2a3a'
  ctx.beginPath()
  arms.forEach(({ angle }, i) => {
    const px = cx + rh * Math.cos(angle - Math.PI / 2)
    const py = cy + rh * Math.sin(angle - Math.PI / 2)
    const qx = cx + rh * Math.cos(angle + Math.PI / 2)
    const qy = cy + rh * Math.sin(angle + Math.PI / 2)
    if (i === 0) { ctx.moveTo(px, py); ctx.lineTo(qx, qy) }
    else         { ctx.lineTo(px, py); ctx.lineTo(qx, qy) }
  })
  ctx.closePath()
  ctx.fill()

  // Junction outline
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth   = 1.5
  ctx.stroke()

  // Labels
  ctx.font        = 'bold 11px monospace'
  ctx.letterSpacing = '0.10em'
  ctx.fillStyle   = 'rgba(148,163,184,0.55)'
  ctx.textAlign   = 'center'
  arms.forEach(({ angle, label }) => {
    const lx = cx + (rh + 30) * Math.cos(angle) * 2.5
    const ly = cy + (rh + 30) * Math.sin(angle) * 2.5
    ctx.save()
    ctx.translate(lx, ly)
    ctx.fillText(label, 0, 4)
    ctx.restore()
  })
  ctx.letterSpacing = '0'
}
```

- [ ] **Step 2: Visual check**

Switch to "Y-Junction". You should see three arms radiating at 120° intervals, each with median, lane markings, stop lines, and a filled hexagonal centre polygon blending the arms together.

---

### Task 8: Improved 6-arm complex

**Files:**
- Modify: `frontend/src/canvas/renderer.ts` — rewrite `drawSixRoads`

- [ ] **Step 1: Replace the entire `drawSixRoads` function**

```typescript
function drawSixRoads(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  rh: number,
  width: number, height: number
): void {
  const len = Math.max(width, height) * 1.1

  // ── Footpath base ─────────────────────────────────────────────────────────
  ctx.fillStyle = FOOTPATH
  ctx.fillRect(0, 0, width, height)

  // ── Road arms (6 × 60°) ───────────────────────────────────────────────────
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)

    // Asphalt
    ctx.fillStyle = '#1a2230'
    ctx.fillRect(0, -rh, len, rh * 2)

    // Kerb lines
    ctx.strokeStyle = 'rgba(71,85,105,0.75)'
    ctx.lineWidth   = 1.5
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(0, -rh); ctx.lineTo(len, -rh)
    ctx.moveTo(0,  rh); ctx.lineTo(len,  rh)
    ctx.stroke()

    // Centre median (yellow)
    ctx.strokeStyle = 'rgba(250,204,21,0.60)'
    ctx.lineWidth   = 1.5
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, s * MEDIAN_PX); ctx.lineTo(len, s * MEDIAN_PX)
      ctx.stroke()
    }

    // Lane dividers
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'
    ctx.lineWidth   = 1
    ctx.setLineDash([12, 10])
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, s * LANE_DIV_1); ctx.lineTo(len, s * LANE_DIV_1)
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Stop line
    ctx.strokeStyle = 'rgba(229,231,235,0.85)'
    ctx.lineWidth   = 2.5
    ctx.beginPath()
    ctx.moveTo(STOP_PX, MEDIAN_PX); ctx.lineTo(STOP_PX, rh)
    ctx.stroke()

    ctx.restore()
  }

  // ── Central hexagonal junction polygon ────────────────────────────────────
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
    const mx = cx + rh * 0.8 * Math.cos((a + next) / 2)
    const my = cy + rh * 0.8 * Math.sin((a + next) / 2)
    ctx.lineTo(mx, my)
  }
  ctx.closePath()
  ctx.fill()

  // Hexagon outline
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
```

- [ ] **Step 2: Visual check**

Switch to "6-Arm Complex". You should see six arms at 60° intervals, each with lane markings, stop lines, and a properly filled hexagonal centre polygon.

---

### Task 9: T-junction visual polish

**Files:**
- Modify: `frontend/src/canvas/renderer.ts` — add rounded terminal marker where S arm would be

- [ ] **Step 1: Add T-junction terminal marker**

Inside `drawIntersection`, after the roundabout section but before the zebra crossings block, add:

```typescript
  // ── T-junction: rounded terminal kerb at south face ────────────────────────
  if (isTJunction) {
    // Visual marker showing road terminates here — small raised curb band
    const bandY = cy + rh
    ctx.fillStyle = '#2d3a4a'
    ctx.fillRect(cx - rh + 4, bandY, rh * 2 - 8, 6)
    ctx.strokeStyle = '#475569'
    ctx.lineWidth   = 1
    ctx.strokeRect(cx - rh + 4, bandY, rh * 2 - 8, 6)

    // "No Through Road" arrow pointing back north inside the box
    const arrowX = cx, arrowY = cy + rh * 0.6
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth   = 1.5
    ctx.lineCap     = 'round'
    // Draw a U-turn arrow: up then arc left then down
    ctx.beginPath()
    ctx.moveTo(arrowX + 8, arrowY + 10)
    ctx.lineTo(arrowX + 8, arrowY - 10)
    ctx.arcTo(arrowX + 8, arrowY - 18, arrowX, arrowY - 18, 8)
    ctx.arcTo(arrowX - 8, arrowY - 18, arrowX - 8, arrowY - 10, 8)
    ctx.lineTo(arrowX - 8, arrowY + 10)
    ctx.stroke()
    // Arrowheads at both ends
    ctx.beginPath()
    ctx.moveTo(arrowX + 4, arrowY + 8); ctx.lineTo(arrowX + 8, arrowY + 12); ctx.lineTo(arrowX + 12, arrowY + 8)
    ctx.moveTo(arrowX - 4, arrowY + 8); ctx.lineTo(arrowX - 8, arrowY + 12); ctx.lineTo(arrowX - 12, arrowY + 8)
    ctx.stroke()
  }
```

- [ ] **Step 2: Visual check**

Switch to "T-Junction". The south face of the intersection should now show a raised curb band and a U-turn arrow indicating the road terminates there.

---

### Task 10: Final integration check — all layouts

- [ ] **Step 1: Run full build**

```bash
cd frontend && npm run build 2>&1
```

Expected: `✓ built in` with zero TypeScript errors and zero `error TS` lines.

- [ ] **Step 2: Start dev server and verify every layout visually**

```bash
npm run dev
```

Open `http://localhost:5173/dashboard`. For each layout in the Config panel, visually verify:

| Layout | What to check |
|--------|---------------|
| **4-Way Cross** | Footpath visible in corners, curved kerbs, faint yellow hatch in box, turn arrows in 12 lane positions |
| **4-Way (Free Left)** | Same as 4-way, plus existing corner islands still render |
| **T-Junction** | No south arm, flat south kerb, raised terminal band, U-turn arrow in box |
| **T-Junction (Free Left)** | Same as T-junction, corner islands on N arm only |
| **Y-Junction** | Three arms at 120°, filled hexagonal centre, labels |
| **6-Arm Complex** | Six arms at 60°, filled hexagonal polygon centre |
| **Roundabout** | Larger island (r=40), ring road with lane divider, yield lines, splitter islands, CW arrows |
| **Roundabout (Free Left)** | Same as roundabout, plus free-left corner islands |

- [ ] **Step 3: Switch layouts mid-simulation**

Start a baseline simulation, then while it runs, click through all 8 layout types. Vehicles should continue rendering on top of whichever layout is shown. No canvas corruption.

- [ ] **Step 4: Split-grid check**

Switch to "Split Grid" view with two layouts selected. Both canvases should render their respective layouts independently. No overlap of lane markings between panes.
