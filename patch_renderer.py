import re
import os

file_path = "d:/Nfinity/Project/WorkSpace/AI_Code/Project_Traffic/Project_T - Ver5/frontend/src/canvas/renderer.ts"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Insert types and helper functions before `export interface RenderConfig`
helpers = """type ArmId = 'N' | 'S' | 'E' | 'W'

export interface LaneRenderConfig {
  n_lanes?: number
  lane_config?: Partial<Record<ArmId, number>>
}

function clampLaneCount(value: unknown, fallback = 3): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(5, Math.round(parsed)))
}

function resolveLaneCounts(config?: LaneRenderConfig): Record<ArmId, number> {
  const base = clampLaneCount(config?.n_lanes, 3)
  return {
    N: clampLaneCount(config?.lane_config?.N, base),
    S: clampLaneCount(config?.lane_config?.S, base),
    E: clampLaneCount(config?.lane_config?.E, base),
    W: clampLaneCount(config?.lane_config?.W, base),
  }
}

function laneEdgePx(count: number): number {
  return MEDIAN_PX + clampLaneCount(count) * LANE_W_PX + 1
}

function laneDividerPx(index: number): number {
  return MEDIAN_PX + index * LANE_W_PX
}

function laneCenterPx(index: number): number {
  return MEDIAN_PX + LANE_W_PX * index + LANE_W_PX / 2
}

export interface RenderConfig {"""
content = content.replace("export interface RenderConfig {", helpers)

# 2. Update drawIntersection signature and local vars
sig_old = """export function drawIntersection(ctx: CanvasRenderingContext2D, cfg: RenderConfig, intersectionType: string = "four_way"): void {
  const cx = cfg.offsetX
  const cy = cfg.offsetY
  const rh = ROAD_HALF_PX
  const isTJunction = intersectionType === 't_junction' || intersectionType === 't_junction_free_left'"""

sig_new = """export function drawIntersection(
  ctx: CanvasRenderingContext2D,
  cfg: RenderConfig,
  intersectionType: string = "four_way",
  laneRenderConfig?: LaneRenderConfig
): void {
  const cx = cfg.offsetX
  const cy = cfg.offsetY
  const lanes = resolveLaneCounts(laneRenderConfig)
  const nEdge = laneEdgePx(lanes.N)
  const sEdge = laneEdgePx(lanes.S)
  const eEdge = laneEdgePx(lanes.E)
  const wEdge = laneEdgePx(lanes.W)
  const rh = Math.max(nEdge, sEdge, eEdge, wEdge)
  const isTJunction = intersectionType === 't_junction' || intersectionType === 't_junction_free_left'"""
content = content.replace(sig_old, sig_new)

# 3. Update road fills
fills_old = """  // Road asphalt — slightly warmer, lighter premium tone
  ctx.fillStyle = '#1a2230'
  ctx.fillRect(0, cy - rh, cfg.width, rh * 2)
  ctx.fillRect(cx - rh, 0, rh * 2, isTJunction ? cy + rh : cfg.height)
  if (!isTJunction) {
    ctx.fillRect(cx - rh, cy - rh, rh * 2, cfg.height - (cy - rh))
  }"""
fills_new = """  // Road asphalt — slightly warmer, lighter premium tone
  ctx.fillStyle = '#1a2230'
  // W arm
  ctx.fillRect(0, cy - wEdge, cx, wEdge * 2)
  // E arm
  ctx.fillRect(cx, cy - eEdge, cfg.width - cx, eEdge * 2)
  // N arm
  ctx.fillRect(cx - nEdge, 0, nEdge * 2, cy)
  // S arm
  if (!isTJunction) {
    ctx.fillRect(cx - sEdge, cy, sEdge * 2, cfg.height - cy)
  }"""
content = content.replace(fills_old, fills_new)

# 4. Update Intersection box KEEP CLEAR hatch bounds
box_old = """  // Intersection box — slightly lighter than road for premium contrast
  ctx.fillStyle = '#1e2a3a'
  ctx.fillRect(cx - rh, cy - rh, rh * 2, rh * 2)"""
box_new = """  // Intersection box — slightly lighter than road for premium contrast
  ctx.fillStyle = '#1e2a3a'
  ctx.fillRect(cx - sEdge, cy - wEdge, sEdge + nEdge, wEdge + eEdge)"""
content = content.replace(box_old, box_new)

# 5. Lane Dividers
dividers_old = """  // Centre median — double yellow solid lines (N/S road)
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
  ctx.setLineDash([])"""

dividers_new = """  // Centre median — double yellow solid lines (N/S road)
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

  // Lane dividers
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = 1
  ctx.setLineDash([14, 10])
  const drawArmDividers = (axis: 'V' | 'H', sign: 1 | -1, count: number, isOppositeEnd: boolean) => {
    for (let idx = 1; idx < count; idx++) {
      ctx.strokeStyle = `rgba(255,255,255,${idx === 1 ? 0.28 : 0.12})`
      const div = laneDividerPx(idx)
      const limit = hasFreeLeft && idx === count - 1 ? Math.max(rh, div + LANE_W_PX) : rh
      ctx.beginPath()
      if (axis === 'V') {
        if (!isOppositeEnd) { // N arm
          ctx.moveTo(cx + sign * div, 0); ctx.lineTo(cx + sign * div, cy - limit)
        } else if (!isTJunction) { // S arm
          ctx.moveTo(cx + sign * div, cy + limit); ctx.lineTo(cx + sign * div, cfg.height)
        }
      } else {
        if (!isOppositeEnd) { // W arm
          ctx.moveTo(0, cy + sign * div); ctx.lineTo(cx - limit, cy + sign * div)
        } else { // E arm
          ctx.moveTo(cx + limit, cy + sign * div); ctx.lineTo(cfg.width, cy + sign * div)
        }
      }
      ctx.stroke()
    }
  }
  
  drawArmDividers('V', 1, lanes.N, false)   // N arm approaching (right side)
  drawArmDividers('V', 1, lanes.S, true)    // S arm exiting (right side)
  drawArmDividers('V', -1, lanes.S, true)   // S arm approaching (left side)
  drawArmDividers('V', -1, lanes.N, false)  // N arm exiting (left side)

  drawArmDividers('H', -1, lanes.W, false)  // W arm approaching (top side)
  drawArmDividers('H', -1, lanes.E, true)   // E arm exiting (top side)
  drawArmDividers('H', 1, lanes.E, true)    // E arm approaching (bottom side)
  drawArmDividers('H', 1, lanes.W, false)   // W arm exiting (bottom side)
  ctx.setLineDash([])"""
content = content.replace(dividers_old, dividers_new)

# 6. Stop lines limits
stop_old = """  // ── Stop lines (solid white) ───────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(229,231,235,0.9)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  const nLimit = hasFreeLeft ? LANE_DIV_2 : rh
  const sLimit = (hasFreeLeft && !isTJunction) ? LANE_DIV_2 : rh
  const eLimit = (hasFreeLeft && intersectionType !== 't_junction_free_left') ? LANE_DIV_2 : rh
  const wLimit = hasFreeLeft ? LANE_DIV_2 : rh"""
stop_new = """  // ── Stop lines (solid white) ───────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(229,231,235,0.9)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  const nLimit = hasFreeLeft ? laneDividerPx(Math.max(1, lanes.N - 1)) : nEdge
  const sLimit = (hasFreeLeft && !isTJunction) ? laneDividerPx(Math.max(1, lanes.S - 1)) : sEdge
  const eLimit = (hasFreeLeft && intersectionType !== 't_junction_free_left') ? laneDividerPx(Math.max(1, lanes.E - 1)) : eEdge
  const wLimit = hasFreeLeft ? laneDividerPx(Math.max(1, lanes.W - 1)) : wEdge"""
content = content.replace(stop_old, stop_new)

# 7. Turn arrows
arrows_old = """  // ── Turn arrows in approach lanes ─────────────────────────────────────────
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
  }"""
arrows_new = """  // ── Turn arrows in approach lanes ─────────────────────────────────────────
  if (!isRoundabout && !isYJunction && !isSixArm) {
    const ARROW_OFFSET = 22
    // N arm (southbound, heading = Math.PI = pointing south/down)
    const nArrowY = cy - STOP_PX - ARROW_OFFSET
    for (let idx = 0; idx < lanes.N; idx++) {
      const type = idx === 0 ? 'straight_left' : idx === lanes.N - 1 ? 'straight_right' : 'straight'
      drawTurnArrow(ctx, cx + laneCenterPx(idx), nArrowY, Math.PI, type)
    }
    // S arm (northbound, heading = 0 = pointing north/up)
    if (!isTJunction) {
      const sArrowY = cy + STOP_PX + ARROW_OFFSET
      for (let idx = 0; idx < lanes.S; idx++) {
        const type = idx === 0 ? 'straight_left' : idx === lanes.S - 1 ? 'straight_right' : 'straight'
        drawTurnArrow(ctx, cx - laneCenterPx(idx), sArrowY, 0, type)
      }
    }
    // E arm (westbound, heading = Math.PI/2 = pointing west/left)
    const eArrowX = cx + STOP_PX + ARROW_OFFSET
    for (let idx = 0; idx < lanes.E; idx++) {
      const type = idx === 0 ? 'straight_left' : idx === lanes.E - 1 ? 'straight_right' : 'straight'
      drawTurnArrow(ctx, eArrowX, cy + laneCenterPx(idx), Math.PI / 2, type)
    }
    // W arm (eastbound, heading = -Math.PI/2 = pointing east/right)
    const wArrowX = cx - STOP_PX - ARROW_OFFSET
    for (let idx = 0; idx < lanes.W; idx++) {
      const type = idx === 0 ? 'straight_left' : idx === lanes.W - 1 ? 'straight_right' : 'straight'
      drawTurnArrow(ctx, wArrowX, cy - laneCenterPx(idx), -Math.PI / 2, type)
    }
  }"""
content = content.replace(arrows_old, arrows_new)

# 8. Intersection Box Outline
outline_old = """  // ── Intersection box outline ───────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(cx - rh + 0.5, cy - rh + 0.5, rh * 2 - 1, rh * 2 - 1)"""
outline_new = """  // ── Intersection box outline ───────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx - sEdge + 0.5, cy - wEdge + 0.5)
  ctx.lineTo(cx + nEdge - 0.5, cy - eEdge + 0.5)
  ctx.lineTo(cx + nEdge - 0.5, cy + eEdge - 0.5)
  ctx.lineTo(cx - sEdge + 0.5, cy + wEdge - 0.5)
  ctx.closePath()
  ctx.stroke()"""
content = content.replace(outline_old, outline_new)

# 9. Kerbs
kerb_old = """    // NW: west edge → corner → N arm left kerb up
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
    }"""
kerb_new = """    // NW: west edge → corner → N arm left kerb up
    kerbPath([[0, cy - wEdge], [cx - nEdge, cy - wEdge], [cx - nEdge, 0]])
    // NE: east edge → corner → N arm right kerb up
    kerbPath([[cfg.width, cy - eEdge], [cx + nEdge, cy - eEdge], [cx + nEdge, 0]])
    if (isTJunction) {
      // No S arm — south kerb spans full width
      ctx.beginPath(); ctx.moveTo(0, cy + wEdge); ctx.lineTo(cx, cy + wEdge); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(cx, cy + eEdge); ctx.lineTo(cfg.width, cy + eEdge); ctx.stroke()
    } else {
      // SW: west edge → corner → S arm left kerb down
      kerbPath([[0, cy + wEdge], [cx - sEdge, cy + wEdge], [cx - sEdge, cfg.height]])
      // SE: east edge → corner → S arm right kerb down
      kerbPath([[cfg.width, cy + eEdge], [cx + sEdge, cy + eEdge], [cx + sEdge, cfg.height]])
    }"""
content = content.replace(kerb_old, kerb_new)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
