import { useLayoutEffect, useRef, useCallback, useState } from 'react'
import { useSimulationStore } from '../store/simulationStore'
import { useConfigStore } from '../store/configStore'
import type { SimFrame } from '../types'
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
} from '../canvas/renderer'

interface SimCanvasProps {
  width?: number
  height?: number
  showTrails?: boolean
  label?: string
  className?: string
  frameOverride?: SimFrame | null
  // Optional speed/playback overlay rendered on the canvas
  speedValue?:    1 | 5 | 10 | 20
  onSpeedChange?: (s: 1 | 5 | 10 | 20) => void
  onPlayPause?:   () => void
  onStop?:        () => void
  isPaused?:      boolean
  isRunning?:     boolean
  responsive?:    boolean
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
  const adverseEvents = useSimulationStore((s) => s.adverseEvents)
  const trainedModels = useSimulationStore((s) => s.trainedModels)
  const intersectionType = useConfigStore((s) => s.simConfig.intersection_type)

  const frame = frameOverride !== undefined ? frameOverride : currentFrame

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // ── HiDPI / Retina fix ────────────────────────────────────────────────────
    const dpr  = window.devicePixelRatio || 1
    const bufW = Math.round(activeWidth  * dpr)
    const bufH = Math.round(activeHeight * dpr)
    if (canvas.width !== bufW || canvas.height !== bufH) {
      canvas.width  = bufW
      canvas.height = bufH
    }

    ctx.save()
    ctx.scale(dpr, dpr)

    const cfg = getDefaultRenderConfig(activeWidth, activeHeight)
    cfg.showTrails = showTrails

    clearCanvas(ctx, cfg)
    drawGrid(ctx, cfg)
    drawIntersection(ctx, cfg, intersectionType)

    if (frame) {
      drawTrafficSignals(ctx, frame.signals, cfg, frame.vehicles, intersectionType)
      frame.vehicles.forEach((v) => drawVehicle(ctx, v, cfg))
      // Draw pedestrian agents (Indian traffic)
      if (frame.pedestrians) {
        frame.pedestrians.forEach((p) => drawPedestrian(ctx, p, cfg))
      }
      // Phase HUD stays — it's compact and shows signal timing at a glance
      frame.signals.forEach((s) => drawSignalIndicator(ctx, s, cfg))
      drawAdverseOverlay(ctx, adverseEvents, cfg)
      // drawStats intentionally removed — t/moving/waiting shown in side panel
    }

    // ── Model label + policy mode badge ──────────────────────────────────────
    if (label) {
      const policyMode = frame?.policy_mode ?? null
      const isRL = label.includes('RL') || label.includes('PPO') || label.includes('DQN') ||
                   label.includes('SAC') || label.includes('A2C') || label.includes('Custom')

      let modelKey = ''
      if      (label.includes('PPO'))    modelKey = 'rl1'
      else if (label.includes('DQN'))    modelKey = 'rl2'
      else if (label.includes('SAC'))    modelKey = 'rl3'
      else if (label.includes('A2C'))    modelKey = 'rl4'
      else if (label.includes('Custom')) modelKey = 'custom'

      const isTrainedRL = isRL && modelKey && trainedModels.includes(modelKey)

      // Accent colour: green = neural model running, blue = trained/baseline, default = muted
      const accentColor =
        policyMode === 'model'     ? 'rgba(74,222,128,0.95)'  :   // bright green — real RL!
        policyMode === 'replay'    ? 'rgba(6,182,212,0.95)'   :   // neon cyan — replay!
        policyMode === 'heuristic' ? 'rgba(251,191,36,0.90)'  :   // amber — trained but using heuristic
        isTrainedRL                ? 'rgba(151,185,167,0.90)' :   // sage — trained
                                     'rgba(143,184,206,0.90)'     // blue — baseline/default

      const borderColor =
        policyMode === 'model'     ? 'rgba(74,222,128,0.35)'  :
        policyMode === 'replay'    ? 'rgba(6,182,212,0.35)'   :
        policyMode === 'heuristic' ? 'rgba(251,191,36,0.30)'  :
        isTrainedRL                ? 'rgba(151,185,167,0.32)' :
                                     'rgba(143,184,206,0.28)'

      // Badge text: append the policy mode so it's unambiguous
      const replayEp = (frame as any)?.replay_episode
      const modeSuffix =
        policyMode === 'model'     ? '  ·  ⚡ MODEL ACTIVE' :
        policyMode === 'replay'    ? `  ·  🎬 REPLAY EP${replayEp ?? ''}` :
        policyMode === 'heuristic' ? '  ·  ~ HEURISTIC'     :
        isTrainedRL                ? '  ·  TRAINED'          : ''
      const badgeText = `${label.toUpperCase()}${modeSuffix}`

      ctx.save()
      ctx.font = 'bold 9px "SF Mono", "Fira Code", monospace'
      const textW  = ctx.measureText(badgeText).width
      const badgeW = textW + 30
      const badgeH = 22
      const bx = 10
      const by = 10

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.beginPath()
      if (ctx.roundRect) { ctx.roundRect(bx + 1, by + 1.5, badgeW, badgeH, 5) }
      else                { ctx.rect(bx + 1, by + 1.5, badgeW, badgeH) }
      ctx.fill()

      // Background — slightly tinted green when model is active
      ctx.fillStyle = policyMode === 'model' ? 'rgba(10,30,16,0.96)' : 'rgba(6,9,14,0.95)'
      ctx.beginPath()
      if (ctx.roundRect) { ctx.roundRect(bx, by, badgeW, badgeH, 5) }
      else                { ctx.rect(bx, by, badgeW, badgeH) }
      ctx.fill()

      ctx.strokeStyle = borderColor
      ctx.lineWidth = 1
      ctx.stroke()

      // Status dot
      ctx.fillStyle = accentColor
      ctx.beginPath()
      ctx.arc(bx + 11, by + badgeH / 2, 3, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = accentColor
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(badgeText, bx + 20, by + badgeH / 2)

      ctx.restore()
    }

    ctx.restore()  // pop the dpr scale
  }, [frame, adverseEvents, activeWidth, activeHeight, showTrails, label, trainedModels, intersectionType])

  useLayoutEffect(() => {
    render()
  }, [render])

  const canvas = (
    <canvas
      ref={canvasRef}
      style={{ width: activeWidth, height: activeHeight, imageRendering: 'auto', display: 'block' }}
      className={`rounded-xl border border-white/[0.06] ${className}`}
    />
  )

  // If no speed controls requested and not responsive, render the bare canvas
  if (!responsive && !onSpeedChange && !onPlayPause) return canvas

  const mainContent = (
    <div className="relative inline-block" style={{ width: activeWidth, height: activeHeight }}>
      {canvas}

      {/* Speed + playback overlay — top-right of canvas */}
      {(onSpeedChange || onPlayPause) && (
        <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/75 backdrop-blur-sm border border-white/10 rounded-full px-1.5 py-1 shadow-lg z-10">
          {/* Playback buttons */}
          {onPlayPause && (
            <button
              onClick={onPlayPause}
              className="text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full text-slate-200 hover:text-white hover:bg-white/10 transition-colors"
            >
              {isPaused ? '▶' : '⏸'}
            </button>
          )}
          {onStop && isRunning && (
            <button
              onClick={onStop}
              className="text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-colors"
            >
              ⏹
            </button>
          )}
          {(onPlayPause || onStop) && <div className="w-px h-3 bg-white/15 mx-0.5" />}
          {/* Speed buttons */}
          {([1, 5, 10, 20] as const).map(s => (
            <button
              key={s}
              onClick={() => onSpeedChange?.(s)}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full transition-all ${
                speedValue === s
                  ? 'bg-cyan-500/25 text-cyan-300 ring-1 ring-cyan-500/50'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'
              }`}
            >
              {s}x
            </button>
          ))}
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

