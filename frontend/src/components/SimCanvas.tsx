import { useLayoutEffect, useEffect, useRef, useCallback, useState } from 'react'
import { useSimulationStore } from '../store/simulationStore'
import { useConfigStore } from '../store/configStore'
import type { SimFrame, VehicleFrame } from '../types'
import {
  clearCanvas,
  drawGrid,
  drawIntersection,
  drawVehicle,
  drawPedestrian,
  drawTrafficSignals,
  drawSignalIndicator,
  drawAdverseOverlay,
  getDefaultRenderConfig,
  worldToCanvas,
} from '../canvas/renderer'

// ── Smooth interpolation helper ──────────────────────────────────────────────
// Lerps an angle, handling the 2π wrap-around so e.g. 350°→10° goes clockwise.
function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a
  while (diff > Math.PI) diff -= 2 * Math.PI
  while (diff < -Math.PI) diff += 2 * Math.PI
  return a + diff * t
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Client-side simulation frame interpolation
function interpolateFrame(
  history: { simTime: number; frame: SimFrame }[],
  tRender: number
): SimFrame | null {
  if (history.length === 0) return null
  if (history.length === 1) return history[0].frame

  // Find the two frames frameA and frameB around tRender
  let index = 0
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].simTime <= tRender && tRender <= history[i + 1].simTime) {
      index = i
      break
    }
  }

  const frameA = history[index].frame
  const frameB = history[index + 1].frame
  const timeA = history[index].simTime
  const timeB = history[index + 1].simTime

  let lerpFactor = 0
  if (timeB > timeA) {
    lerpFactor = (tRender - timeA) / (timeB - timeA)
  } else {
    return frameB
  }

  // Interpolate vehicles
  const interpolatedVehicles: VehicleFrame[] = []
  const vehiclesBMap = new Map<string, VehicleFrame>(
    frameB.vehicles.map((v) => [v.id, v])
  )

  for (const vA of frameA.vehicles) {
    const vB = vehiclesBMap.get(vA.id)
    if (vB) {
      const x = lerp(vA.x, vB.x, lerpFactor)
      const y = lerp(vA.y, vB.y, lerpFactor)
      let angle = vA.angle
      if (vA.angle !== undefined && vB.angle !== undefined) {
        angle = lerpAngle(vA.angle, vB.angle, lerpFactor)
      } else if (vB.angle !== undefined) {
        angle = vB.angle
      }

      interpolatedVehicles.push({
        ...vB,
        x,
        y,
        angle,
        speed: lerp(vA.speed, vB.speed, lerpFactor),
        wait_time: lerp(vA.wait_time, vB.wait_time, lerpFactor),
      })
    } else {
      // Vehicle exited in frameB: extrapolate to slide it off screen smoothly
      const angle = vA.angle ?? 0
      const dx = -Math.cos(angle)
      const dy = -Math.sin(angle)
      const dt = tRender - timeA
      const x = vA.x + vA.speed * dt * dx
      const y = vA.y + vA.speed * dt * dy
      interpolatedVehicles.push({
        ...vA,
        x,
        y,
      })
    }
  }

  // Include vehicles that spawned in frameB but are not in frameA
  for (const vB of frameB.vehicles) {
    if (!frameA.vehicles.some((v) => v.id === vB.id)) {
      interpolatedVehicles.push(vB)
    }
  }

  // Interpolate pedestrians
  const interpolatedPedestrians: any[] = []
  if (frameA.pedestrians && frameB.pedestrians) {
    const pedsBMap = new Map<string, any>(
      frameB.pedestrians.map((p) => [p.id, p])
    )

    for (const pA of frameA.pedestrians) {
      const pB = pedsBMap.get(pA.id)
      if (pB) {
        const x = lerp(pA.x, pB.x, lerpFactor)
        const y = lerp(pA.y, pB.y, lerpFactor)
        interpolatedPedestrians.push({
          ...pB,
          x,
          y,
        })
      }
    }
  }

  return {
    ...frameB,
    sim_time_s: tRender,
    vehicles: interpolatedVehicles,
    pedestrians: frameB.pedestrians ? interpolatedPedestrians : undefined,
  }
}


const humanReadableVehicleType = (typeId: string): string => {
  const mapping: Record<string, string> = {
    car: 'Car',
    two_wheeler: 'Two Wheeler',
    ev_scooter: 'EV Scooter',
    auto_rickshaw: 'Auto Rickshaw',
    e_rickshaw: 'E-Rickshaw',
    cab: 'Cab',
    delivery_bike: 'Delivery Bike',
    tsrtc_bus: 'TSRTC Bus',
    school_bus: 'School Bus',
    truck: 'Truck',
  }
  return mapping[typeId] || typeId.toUpperCase()
}

interface SimCanvasProps {
  width?: number
  height?: number
  showTrails?: boolean
  label?: string
  className?: string
  frameOverride?: SimFrame | null
  // Optional speed/playback overlay rendered on the canvas
  speedValue?: 1 | 5 | 10 | 20
  onSpeedChange?: (s: 1 | 5 | 10 | 20) => void
  onPlayPause?: () => void
  onStop?: () => void
  isPaused?: boolean
  isRunning?: boolean
  responsive?: boolean
}

export default function SimCanvas({
  width = 600,
  height = 500,
  showTrails = true,
  label,
  className = '',
  frameOverride,
  speedValue,
  onSpeedChange,
  onPlayPause,
  onStop,
  isPaused = false,
  isRunning = false,
  responsive = false,
}: SimCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // ── Smooth-animation refs (mutated without causing re-renders) ─────────────
  const framesHistoryRef = useRef<{ simTime: number; frame: SimFrame; wallTime: number }[]>([])
  const simTimeGapRef    = useRef<number>(0.5)
  const wallTimeGapRef   = useRef<number>(0.033)   // EMA of real wall-clock gap between frame arrivals
  const T_renderRef      = useRef<number | null>(null)
  const lastRafTimeRef   = useRef<number>(0)
  const renderRef        = useRef<((f?: SimFrame) => void) | null>(null)
  const rafIdRef         = useRef<number>(0)

  // Sync state parameters to refs to keep the RAF loop independent of render lifecycles
  const isRunningRef = useRef(isRunning)
  const isPausedRef = useRef(isPaused)
  const speedValueRef = useRef(speedValue)

  useEffect(() => {
    isRunningRef.current = isRunning
    isPausedRef.current = isPaused
  }, [isRunning, isPaused])

  // Keep track of dimensions when responsive
  const [responsiveSize, setResponsiveSize] = useState({ w: width, h: height })

  useLayoutEffect(() => {
    if (!responsive || !containerRef.current) return

    const handleResize = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()

      const targetRatio = width / height
      let newW = rect.width
      let newH = rect.height

      if (rect.width / rect.height > targetRatio) {
        newH = rect.height
        newW = rect.height * targetRatio
      } else {
        newW = rect.width
        newH = rect.width / targetRatio
      }

      if (newW > 0 && newH > 0) {
        setResponsiveSize({ w: Math.floor(newW), h: Math.floor(newH) })
      }
    }

    handleResize()

    const observer = new ResizeObserver(() => {
      handleResize()
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
    }
  }, [responsive, width, height])

  const activeWidth = responsive ? responsiveSize.w : width
  const activeHeight = responsive ? responsiveSize.h : height

  const currentFrame = useSimulationStore((s) => s.currentFrame)
  const adverseEvents = useSimulationStore((s) => s.viewMode === 'split' ? s.splitAdverseEvents : s.adverseEvents)
  const trainedModels = useSimulationStore((s) => s.trainedModels)
  const intersectionType = useConfigStore((s) => s.simConfig.intersection_type)
  const nLanes = useConfigStore((s) => s.simConfig.n_lanes)
  const laneConfig = useConfigStore((s) => s.simConfig.lane_config)

  const frame = frameOverride !== undefined ? frameOverride : currentFrame

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [selectedVehicleData, setSelectedVehicleData] = useState<VehicleFrame | null>(null)

  // Track the selected vehicle and update its state as the simulation updates
  useLayoutEffect(() => {
    if (!selectedVehicleId || !frame) return
    const currentVeh = frame.vehicles.find(v => v.id === selectedVehicleId)
    if (currentVeh) {
      setSelectedVehicleData(currentVeh)
    }
  }, [frame, selectedVehicleId])

  // Reset selection when simulation stops or resets
  useLayoutEffect(() => {
    if (!isRunning) {
      setSelectedVehicleId(null)
      setSelectedVehicleData(null)
    }
  }, [isRunning])

  // ── Sync incoming frame → history buffer ───────────────────────────────────
  useEffect(() => {
    if (frame === null) {
      framesHistoryRef.current = []
      T_renderRef.current = null
      simTimeGapRef.current = 0.5
      wallTimeGapRef.current = 0.033
      lastRafTimeRef.current = 0
      return
    }
    const now = performance.now() / 1000  // wall-clock seconds
    const history = framesHistoryRef.current
    const prevEntry = history[history.length - 1]
    if (prevEntry) {
      const simGap = frame.sim_time_s - prevEntry.simTime
      const wallGap = now - prevEntry.wallTime
      if (simGap > 0) {
        simTimeGapRef.current = 0.8 * simTimeGapRef.current + 0.2 * simGap
      }
      if (wallGap > 0.001) {
        wallTimeGapRef.current = 0.8 * wallTimeGapRef.current + 0.2 * wallGap
      }
    }
    history.push({ simTime: frame.sim_time_s, frame, wallTime: now })
    // Keep 60 frames for smoother interpolation at high speeds
    if (history.length > 60) {
      history.shift()
    }
  }, [frame])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()

    // Scale client coords to match canvas design width/height (activeWidth/activeHeight)
    // because canvas element might be scaled down by CSS/responsive wrapper
    const cx = (e.clientX - rect.left) * (activeWidth / rect.width)
    const cy = (e.clientY - rect.top) * (activeHeight / rect.height)

    if (!frame) return

    const cfg = getDefaultRenderConfig(activeWidth, activeHeight)
    let closestVehicle: VehicleFrame | null = null
    let minDistance = 25 // 25 canvas pixels threshold

    for (const v of frame.vehicles) {
      const [vx, vy] = worldToCanvas(v.x, v.y, cfg)
      const dist = Math.hypot(vx - cx, vy - cy)
      if (dist < minDistance) {
        minDistance = dist
        closestVehicle = v
      }
    }

    if (closestVehicle) {
      setSelectedVehicleId(closestVehicle.id)
      setSelectedVehicleData(closestVehicle)
    } else {
      setSelectedVehicleId(null)
      setSelectedVehicleData(null)
    }
  }

  const render = useCallback((displayFrame?: SimFrame) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ── HiDPI / Retina fix ────────────────────────────────────────────────────
    const dpr = window.devicePixelRatio || 1
    const bufW = Math.round(activeWidth * dpr)
    const bufH = Math.round(activeHeight * dpr)
    if (canvas.width !== bufW || canvas.height !== bufH) {
      canvas.width = bufW
      canvas.height = bufH
    }

    ctx.save()
    ctx.scale(dpr, dpr)

    const cfg = getDefaultRenderConfig(activeWidth, activeHeight)
    cfg.showTrails = showTrails

    clearCanvas(ctx, cfg)
    drawGrid(ctx, cfg)
    drawIntersection(ctx, cfg, intersectionType, { n_lanes: nLanes, lane_config: laneConfig })

    const f = displayFrame ?? frame
    if (f) {
      const vehiclesToDraw = f.vehicles

      drawTrafficSignals(ctx, f.signals, cfg, vehiclesToDraw, intersectionType, { n_lanes: nLanes, lane_config: laneConfig })
      vehiclesToDraw.forEach((v) => drawVehicle(ctx, v, cfg))

      // Highlight selected vehicle on canvas (at interpolated position)
      if (selectedVehicleId) {
        const selectedVeh = vehiclesToDraw.find(v => v.id === selectedVehicleId)
        if (selectedVeh) {
          const [vx, vy] = worldToCanvas(selectedVeh.x, selectedVeh.y, cfg)
          ctx.save()
          ctx.strokeStyle = '#22d3ee' // bright steel-blue/cyan
          ctx.lineWidth = 1.75
          ctx.setLineDash([4, 4])
          ctx.shadowColor = 'rgba(34, 211, 238, 0.45)'
          ctx.shadowBlur = 6
          ctx.beginPath()
          ctx.arc(vx, vy, 18, 0, Math.PI * 2)
          ctx.stroke()
          ctx.restore()
        }
      }

      // Draw pedestrian agents (Indian traffic)
      if (f.pedestrians) {
        f.pedestrians.forEach((p) => drawPedestrian(ctx, p, cfg))
      }
      // Phase HUD stays — it's compact and shows signal timing at a glance
      f.signals.forEach((s) => drawSignalIndicator(ctx, s, cfg, intersectionType))
      drawAdverseOverlay(ctx, adverseEvents, cfg)
      // drawStats intentionally removed — t/moving/waiting shown in side panel
    }

    // ── Model label + policy mode badge ──────────────────────────────────────
    if (label) {
      const policyMode = f?.policy_mode ?? null
      const isRL = label.includes('RL') || label.includes('PPO') || label.includes('DQN') ||
        label.includes('SAC') || label.includes('A2C') || label.includes('Custom')

      let modelKey = ''
      if (label.includes('PPO')) modelKey = 'rl1'
      else if (label.includes('DQN')) modelKey = 'rl2'
      else if (label.includes('SAC')) modelKey = 'rl3'
      else if (label.includes('A2C')) modelKey = 'rl4'
      else if (label.includes('Custom')) modelKey = 'custom'

      const isTrainedRL = isRL && modelKey && trainedModels.includes(modelKey)

      // Badge text: extract only the policy status to keep it clean since the model label is shown in the card header
      const replayEp = (f as any)?.replay_episode
      const statusText =
        policyMode === 'model' ? '⚡ MODEL ACTIVE' :
          policyMode === 'replay' ? `🎬 REPLAY EP${replayEp ?? ''}` :
            policyMode === 'heuristic' ? '~ HEURISTIC' :
              isTrainedRL ? 'TRAINED' : ''

      if (statusText) {
        // Accent colour: green = neural model running, blue = trained/baseline, default = muted
        const accentColor =
          policyMode === 'model' ? 'rgba(74,222,128,0.95)' :   // bright green — real RL!
            policyMode === 'replay' ? 'rgba(6,182,212,0.95)' :   // neon cyan — replay!
              policyMode === 'heuristic' ? 'rgba(251,191,36,0.90)' :   // amber — trained but using heuristic
                isTrainedRL ? 'rgba(151,185,167,0.90)' :   // sage — trained
                  'rgba(143,184,206,0.90)'     // blue — baseline/default

        const borderColor =
          policyMode === 'model' ? 'rgba(74,222,128,0.35)' :
            policyMode === 'replay' ? 'rgba(6,182,212,0.35)' :
              policyMode === 'heuristic' ? 'rgba(251,191,36,0.30)' :
                isTrainedRL ? 'rgba(151,185,167,0.32)' :
                  'rgba(143,184,206,0.28)'

        ctx.save()
        ctx.font = 'bold 9px "SF Mono", "Fira Code", monospace'
        const textW = ctx.measureText(statusText).width
        const badgeW = textW + 22
        const badgeH = 18
        const bx = 10
        const by = 10

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.beginPath()
        if (ctx.roundRect) { ctx.roundRect(bx + 1, by + 1.5, badgeW, badgeH, 4) }
        else { ctx.rect(bx + 1, by + 1.5, badgeW, badgeH) }
        ctx.fill()

        // Background — slightly tinted green when model is active
        ctx.fillStyle = policyMode === 'model' ? 'rgba(10,30,16,0.96)' : 'rgba(6,9,14,0.95)'
        ctx.beginPath()
        if (ctx.roundRect) { ctx.roundRect(bx, by, badgeW, badgeH, 4) }
        else { ctx.rect(bx, by, badgeW, badgeH) }
        ctx.fill()

        ctx.strokeStyle = borderColor
        ctx.lineWidth = 1
        ctx.stroke()

        // Status dot
        ctx.fillStyle = accentColor
        ctx.beginPath()
        ctx.arc(bx + 9, by + badgeH / 2, 2.5, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = accentColor
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText(statusText, bx + 16, by + badgeH / 2)

        ctx.restore()
      }
    }

    ctx.restore()  // pop the dpr scale
  }, [frame, adverseEvents, activeWidth, activeHeight, showTrails, label, trainedModels, intersectionType, nLanes, laneConfig, selectedVehicleId])

  // ── Always keep renderRef pointing to the latest render function ──────────
  renderRef.current = render

  // ── 60 fps requestAnimationFrame loop with data-driven interpolation ──────
  // The render cursor derives its speed from the ratio of sim-time gap to
  // wall-clock gap between frame arrivals.  This is always in sync with
  // actual data regardless of React state staleness.
  useLayoutEffect(() => {
    const loop = (time: number) => {
      const dtReal = lastRafTimeRef.current > 0
        ? Math.min((time - lastRafTimeRef.current) / 1000, 0.1)
        : 0
      lastRafTimeRef.current = time

      const history = framesHistoryRef.current
      if (history.length === 0) {
        renderRef.current?.(undefined)
        rafIdRef.current = requestAnimationFrame(loop)
        return
      }

      if (history.length < 2) {
        renderRef.current?.(history[0].frame)
        rafIdRef.current = requestAnimationFrame(loop)
        return
      }

      const latestEntry = history[history.length - 1]
      const simTimeGap = simTimeGapRef.current
      const wallTimeGap = wallTimeGapRef.current

      // Derive effective speed from actual frame data:
      // effectiveSpeed = simTimeGap / wallTimeGap
      // e.g. at 20x: simTimeGap ≈ 0.25s, wallTimeGap ≈ 0.0125s → ratio ≈ 20
      const effectiveSpeed = wallTimeGap > 0.001
        ? simTimeGap / wallTimeGap
        : 1.0

      // Target delay of 1.5 frame intervals behind latest
      const delay = 1.5 * simTimeGap
      const T_target = latestEntry.simTime - delay

      if (T_renderRef.current === null) {
        T_renderRef.current = T_target
      }

      const running = isRunningRef.current
      const paused = isPausedRef.current

      if (dtReal > 0 && running && !paused) {
        const error = T_target - T_renderRef.current!
        // If error is too large (e.g. simulation reset or seek), snap
        if (Math.abs(error) > 3 * simTimeGap) {
          T_renderRef.current = T_target
        } else {
          // P-controller: advance at effective speed with smooth correction
          const kp = 2.0 / Math.max(simTimeGap, 0.01)
          const adjustment = 1.0 + kp * error
          const clamped = Math.max(0.5, Math.min(3.0, adjustment))
          T_renderRef.current! += dtReal * effectiveSpeed * clamped
        }
      }

      // Clamp render cursor strictly to bounds of history range
      const tRender = Math.max(
        history[0].simTime,
        Math.min(latestEntry.simTime, T_renderRef.current ?? T_target)
      )
      T_renderRef.current = tRender

      const interpFrame = interpolateFrame(history, tRender)
      if (interpFrame) {
        renderRef.current?.(interpFrame)
      } else {
        renderRef.current?.(latestEntry.frame)
      }

      rafIdRef.current = requestAnimationFrame(loop)
    }

    rafIdRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafIdRef.current)
  }, []) // empty deps — loop runs for the component lifetime

  const canvas = (
    <canvas
      ref={canvasRef}
      onClick={handleCanvasClick}
      style={{ width: activeWidth, height: activeHeight, imageRendering: 'auto', display: 'block', cursor: 'pointer' }}
      className={`rounded-xl border border-white/[0.06] ${className}`}
    />
  )

  // If no speed controls requested and not responsive, render the bare canvas
  if (!responsive && !onSpeedChange && !onPlayPause && !(isRunning && !frame)) return canvas

  // isCompact: use cycling speed badge when canvas is too narrow for the full row
  // Below 680px, full bar (play+stop+5 speeds) would overlap the road arms
  const isCompact = activeWidth < 680;

  const mainContent = (
    <div style={{ position: 'relative', display: 'inline-block', width: activeWidth, height: activeHeight }}>
      {canvas}

      {/* Starting/Loading Overlay */}
      {isRunning && !frame && (
        <div className="absolute inset-0 bg-[#07090d]/85 backdrop-blur-md flex flex-col items-center justify-center rounded-xl animate-fadeIn z-20">
          <div className="flex flex-col items-center gap-4 text-center p-6 max-w-sm">
            <div className="relative w-12 h-12 flex items-center justify-center">
              {/* Outer pulsing ring */}
              <div className="absolute inset-0 rounded-full border-2 border-[#10b981]/15 animate-ping duration-1000" />
              {/* Inner spinning ring */}
              <div className="w-10 h-10 rounded-full border-2 border-slate-700/50 border-t-[#10b981] animate-spin" />
              {/* Center static dot */}
              <div className="absolute w-2 h-2 rounded-full bg-[#10b981]" />
            </div>
            
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-slate-100 tracking-wide uppercase font-mono">
                Initializing Simulation
              </h4>
              <p className="text-xs text-slate-400 font-medium">
                {label ? `Loading ${label}...` : 'Resolving runtime dependencies...'}
              </p>
              <p className="text-[10px] text-slate-500 font-mono italic animate-pulse">
                Please wait (this may take a few seconds on first run)
              </p>
            </div>
          </div>
        </div>
      )}


      {/* Speed + playback controller bar — rendered on top right of the canvas itself */}
      {isRunning && (onSpeedChange || onPlayPause) && (
        <div
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
          className="flex items-center gap-1 bg-[#07090f] border border-white/[0.10] rounded-full px-2.5 py-1 shadow-[0_2px_12px_rgba(0,0,0,0.55)] animate-fadeIn"
        >
          {/* Play/Pause — always show unless canvas is tiny */}
          {onPlayPause && (
            <button
              onClick={onPlayPause}
              type="button"
              className="w-[22px] h-[22px] flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all flex-shrink-0"
              title={isPaused ? 'Resume Simulation' : 'Pause Simulation'}
            >
              {isPaused ? (
                <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><path d="M8 5v14l11-7z" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              )}
            </button>
          )}

          {/* Stop */}
          {onStop && (
            <button
              onClick={onStop}
              type="button"
              className="w-[22px] h-[22px] flex items-center justify-center rounded-full text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-all flex-shrink-0"
              title="Stop Simulation"
            >
              <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><rect x="5" y="5" width="14" height="14" rx="1.5" /></svg>
            </button>
          )}

          {/* Separator */}
          {(onPlayPause || onStop) && onSpeedChange && (
            <div className="w-[1px] h-4 bg-white/[0.12] mx-0.5 flex-shrink-0" />
          )}

          {/* Speed Controls */}
          {onSpeedChange && (
            isCompact ? (
              /* Compact: single cycling badge */
              <button
                onClick={() => {
                  const speeds: (1 | 5 | 10 | 20)[] = [1, 5, 10, 20];
                  const idx = speeds.indexOf((speedValue as any) ?? 5);
                  onSpeedChange(speeds[(idx + 1) % speeds.length]);
                }}
                type="button"
                className="px-2 py-0.5 text-[9px] font-bold font-mono rounded-full bg-[#0e2a35] text-cyan-400 border border-cyan-400/35 hover:border-cyan-400/65 transition-all shadow-[0_0_6px_rgba(34,211,238,0.12)] flex-shrink-0"
                title="Cycle Speed"
              >
                {speedValue ?? 5}x
              </button>
            ) : (
              /* Full: individual speed badges */
              <div className="flex items-center gap-0.5">
                {([1, 5, 10, 20] as const).map(s => {
                  const isActive = speedValue === s;
                  return (
                    <button
                      key={s}
                      onClick={() => onSpeedChange(s)}
                      type="button"
                      className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded-full transition-all duration-150 flex-shrink-0 ${isActive
                          ? 'bg-[#0e2a35] text-cyan-400 border border-cyan-400/45 shadow-[0_0_8px_rgba(34,211,238,0.22)]'
                          : 'text-slate-500 hover:text-slate-300 border border-transparent hover:bg-white/[0.05]'
                        }`}
                    >
                      {s}x
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* Vehicle details overlay */}
      {selectedVehicleId && selectedVehicleData && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            width: 240,
            zIndex: 30,
          }}
          className="glass-card rounded-xl p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] text-white font-sans text-xs animate-fadeIn"
        >
          {/* Close button */}
          <button
            onClick={() => {
              setSelectedVehicleId(null)
              setSelectedVehicleData(null)
            }}
            type="button"
            className="absolute top-2.5 right-2.5 text-slate-400 hover:text-white transition-colors p-0.5"
            title="Dismiss Inspector"
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current stroke-2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>

          {/* Indian Number Plate & Status */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="bg-[#facc15] text-[#07090f] px-2 py-0.5 rounded border border-yellow-500/30 font-bold tracking-wider text-[10px] uppercase font-mono shadow-[0_2px_8px_rgba(250,204,21,0.25)] flex items-center gap-1">
              <span className="text-[7px] border border-black/20 rounded px-0.5 py-0">IND</span>
              <span>{selectedVehicleData.number_plate || 'TS09EX1234'}</span>
            </div>

            {frame?.vehicles.some(v => v.id === selectedVehicleId) ? (
              <span className="flex items-center gap-1.5 text-[9px] text-green-400 font-semibold font-mono uppercase bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Active
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[9px] text-slate-400 font-semibold font-mono uppercase bg-slate-500/10 px-2 py-0.5 rounded-full border border-white/5">
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full" />
                Exited
              </span>
            )}
          </div>

          {/* Telemetry info */}
          <div className="space-y-1.5">
            <div className="flex justify-between border-b border-white/[0.04] pb-1">
              <span className="text-slate-400 text-[10px]">Type</span>
              <span className="font-semibold text-slate-200">{humanReadableVehicleType(selectedVehicleData.type_id)}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.04] pb-1">
              <span className="text-slate-400 text-[10px]">ID</span>
              <span className="font-mono text-slate-300">{selectedVehicleData.id}</span>
            </div>
            <div className="flex justify-between border-b border-white/[0.04] pb-1">
              <span className="text-slate-400 text-[10px]">Speed</span>
              <span className={`font-semibold font-mono ${frame?.vehicles.some(v => v.id === selectedVehicleId) && selectedVehicleData.speed < 0.5 ? 'text-amber-400' : 'text-cyan-400'}`}>
                {frame?.vehicles.some(v => v.id === selectedVehicleId) ? `${(selectedVehicleData.speed * 3.6).toFixed(1)} km/h` : '0.0 km/h'}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/[0.04] pb-1">
              <span className="text-slate-400 text-[10px]">Wait Time</span>
              <span className={`font-semibold font-mono ${selectedVehicleData.wait_time > 15 ? 'text-red-400' : selectedVehicleData.wait_time > 5 ? 'text-amber-400' : 'text-green-400'}`}>
                {selectedVehicleData.wait_time.toFixed(1)}s
              </span>
            </div>
            <div className="flex justify-between border-b border-white/[0.04] pb-1">
              <span className="text-slate-400 text-[10px]">Lane</span>
              <span className="text-slate-300 font-mono">{selectedVehicleData.lane || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-[10px]">Route</span>
              <span className="text-slate-300 capitalize flex items-center gap-1 font-medium font-mono text-[10px]">
                {selectedVehicleData.arm || 'N/A'} Arm → {
                  selectedVehicleData.turn === 'straight' ? 'Straight ⬆' :
                    selectedVehicleData.turn === 'right' ? 'Right Turn ↗' :
                      selectedVehicleData.turn === 'left' ? 'Left Turn ↖' : 'Straight ⬆'
                }
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  if (responsive) {
    return (
      <div ref={containerRef} className="w-full h-full min-w-0 min-h-0 flex items-center justify-center overflow-hidden">
        {mainContent}
      </div>
    )
  }

  return mainContent
}
