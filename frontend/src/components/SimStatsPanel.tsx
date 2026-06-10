import React from 'react'
import HelpPopover from './HelpPopover'
import { useSimulationStore } from '../store/simulationStore'
import { MODEL_METADATA } from '../utils/constants'
import type { SimFrame } from '../types'

// ── Constants & Helpers ──────────────────────────────────────────────────────
function fmtClock(s: number) {
  const hrs = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = Math.floor(s % 60)
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const PHASE_NAMES: Record<number, string> = {
  0: 'N–S Green',
  1: 'N–S Yellow',
  2: 'E–W Green',
  3: 'E–W Yellow',
  4: 'All Red',
}

const PHASE_COLORS: Record<number, string> = {
  0: '#10b981', // green
  1: '#f59e0b', // yellow
  2: '#10b981', // green
  3: '#f59e0b', // yellow
  4: '#ef4444', // red
}

const ARM_META: Record<string, { label: string; arrow: string }> = {
  N: { label: 'North', arrow: '↓' },
  S: { label: 'South', arrow: '↑' },
  E: { label: 'East', arrow: '←' },
  W: { label: 'West', arrow: '→' },
}

function congestionLevel(stopPct: number) {
  if (stopPct < 20) return { label: 'Free Flow', color: '#10b981' }
  if (stopPct < 40) return { label: 'Light', color: '#34d399' }
  if (stopPct < 60) return { label: 'Moderate', color: '#f59e0b' }
  if (stopPct < 80) return { label: 'Heavy', color: '#f97316' }
  return { label: 'Critical', color: '#ef4444' }
}

function levelOfService(delayS: number) {
  if (delayS <= 10) return { grade: 'A', color: '#10b981', desc: 'Free flow' }
  if (delayS <= 20) return { grade: 'B', color: '#34d399', desc: 'Stable operation' }
  if (delayS <= 35) return { grade: 'C', color: '#a3e635', desc: 'Acceptable delay' }
  if (delayS <= 55) return { grade: 'D', color: '#f59e0b', desc: 'Approaching limit' }
  if (delayS <= 80) return { grade: 'E', color: '#f97316', desc: 'At capacity' }
  return { grade: 'F', color: '#ef4444', desc: 'Oversaturated' }
}

function calculateStats(frame: SimFrame | null) {
  if (!frame) return null

  const vehicles = frame.vehicles
  const total = vehicles.length
  const stopped = vehicles.filter((v) => v.speed < 0.5).length
  const stopPct = total > 0 ? (stopped / total) * 100 : 0
  const cong = congestionLevel(stopPct)

  const waitTimes = vehicles.map((v) => v.wait_time).filter((w) => w > 0)
  const avgWait = waitTimes.length ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0
  const maxWait = waitTimes.length ? Math.max(...waitTimes) : 0
  const los = levelOfService(avgWait)

  const signal = frame.signals[0]
  const phase = signal?.phase ?? 0
  const phColor = PHASE_COLORS[phase] ?? '#fff'
  const phName = PHASE_NAMES[phase] ?? `Phase ${phase}`
  const remaining = signal?.remaining_s ?? 0

  return {
    total,
    stopped,
    stopPct,
    cong,
    avgWait,
    maxWait,
    los,
    phase,
    phColor,
    phName,
    remaining,
    frameStep: frame.step,
  }
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function SectionTitle({ children, helpText }: { children: React.ReactNode; helpText?: string }) {
  return (
    <h4 className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-2 font-mono flex items-center gap-1.5">
      <span className="w-1 h-2.5 rounded-full bg-[#8fb8ce]/40 inline-block flex-shrink-0" />
      {children}
      {helpText && <HelpPopover text={helpText} position="left" />}
    </h4>
  )
}

function ComparativeStatTile({
  label,
  modelsStats,
  unit = '',
  format = (v: number) => v.toFixed(1),
}: {
  label: string
  modelsStats: Array<{
    key: string
    meta: { label: string; color: string }
    stats: any
  }>
  unit?: string
  format?: (v: number) => string
}) {
  const count = modelsStats.length
  const gridClass = count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : count === 3 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className="bg-black/25 border border-white/[0.05] rounded-xl p-2.5 flex flex-col gap-1.5 w-full">
      <div className="text-[8px] font-bold tracking-widest uppercase text-slate-600 font-mono leading-none">
        {label}
      </div>
      <div className={`grid ${gridClass} gap-2 text-xs font-mono font-bold leading-tight`}>
        {modelsStats.map(({ key, meta, stats }, idx) => {
          let valNum: number | undefined
          if (label.includes('Avg')) valNum = stats?.avgWait
          else if (label.includes('Max')) valNum = stats?.maxWait
          else if (label.includes('Total')) valNum = stats?.total
          else if (label.includes('Waiting')) valNum = stats?.stopped

          return (
            <div key={key} className={`flex flex-col ${idx > 0 ? 'border-l border-white/[0.05] pl-2' : ''}`}>
              <span className="text-[9px] font-bold uppercase tracking-widest font-mono mb-0.5 truncate" style={{ color: meta.color }}>
                {meta.label.split(' ')[0]}
              </span>
              <span className="tabular-nums" style={{ color: stats && valNum !== undefined && valNum > 0 ? '#f1f5f9' : '#475569' }}>
                {valNum !== undefined ? `${format(valNum)}${unit}` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SimStatsPanel() {
  const isRunning = useSimulationStore((s) => s.isRunning)
  const simTimeS = useSimulationStore((s) => s.simTimeS)
  const viewMode = useSimulationStore((s) => s.viewMode)

  const selectedModelSingle = useSimulationStore((s) => s.selectedModelSingle)
  const selectedModelsSplit = useSimulationStore((s) => s.selectedModelsSplit)

  const baselineFrame = useSimulationStore((s) => s.baselineFrame)
  const rl1Frame = useSimulationStore((s) => s.rl1Frame)
  const rl2Frame = useSimulationStore((s) => s.rl2Frame)
  const rl3Frame = useSimulationStore((s) => s.rl3Frame)
  const rl4Frame = useSimulationStore((s) => s.rl4Frame)

  const getFrameForModel = (modelName: string) => {
    if (modelName === 'baseline') return baselineFrame
    if (modelName === 'rl1') return rl1Frame
    if (modelName === 'rl2') return rl2Frame
    if (modelName === 'rl3') return rl3Frame
    if (modelName === 'rl4') return rl4Frame
    return null
  }

  // Determine active keys based on current viewMode
  const activeKeys = viewMode === 'single' ? [selectedModelSingle] : selectedModelsSplit
  const count = activeKeys.length

  // Calculate stats for each active model
  const modelsStats = activeKeys.map((key) => {
    const frame = getFrameForModel(key)
    const stats = calculateStats(frame)
    const meta = MODEL_METADATA[key] ?? { label: key, color: '#fff', indicatorColor: 'bg-gray-400' }
    return { key, meta, stats, frame }
  })

  // Ensure at least one frame is active to render dashboard, otherwise show idle
  const hasFrames = modelsStats.some(({ frame }) => frame !== null)

  if (!isRunning || !hasFrames) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
        <div className="w-8 h-8 rounded-full border border-white/[0.08] flex items-center justify-center">
          <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4 text-slate-600">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600 font-mono">Awaiting Simulation</p>
          <p className="text-[10px] text-slate-700 mt-1">Start the simulation to view<br />live comparative statistics</p>
        </div>
      </div>
    )
  }

  const gridClass = count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : count === 3 ? 'grid-cols-3' : 'grid-cols-4'
  const arms = ['N', 'S', 'E', 'W'] as const

  return (
    <div className="space-y-4 text-xs select-none">
      {/* Timer Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          <span className="text-[9px] font-bold font-mono text-slate-500 uppercase tracking-widest">LIVE STATUS HUB</span>
        </div>
        <span className="text-[10px] font-mono text-slate-400 font-bold tabular-nums">
          {fmtClock(simTimeS)}
        </span>
      </div>

      {/* LIVE COMPARATIVE OVERVIEW */}
      <div>
        <SectionTitle helpText="### Live Status Grid\nDetailed real-time simulation variables:\n- **Level of Service (LOS)**: Highway capacity standard ranking wait time from grade A (delay $\le 10s$, free flow) to F ($> 80s$, oversaturated).\n- **Phase**: Active green phase axis (N-S or E-W) and duration countdown.\n- **Traffic**: Stopped vehicle ratio indicating congestion scaling.">Live Status Grid</SectionTitle>
        <div className={`grid ${gridClass} gap-2 bg-black/20 p-2.5 rounded-xl border border-white/[0.05]`}>

          {modelsStats.map(({ key, meta, stats }, idx) => (
            <div key={key} className={`flex flex-col gap-2 ${idx > 0 ? 'border-l border-gray-800/80 pl-2' : ''}`}>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${meta.indicatorColor} ${key !== 'baseline' ? 'animate-pulse' : ''}`} />
                <span className="font-bold text-[10px] truncate uppercase font-sans tracking-wide" style={{ color: meta.color }}>
                  {meta.label.split(' ')[0]} {meta.label.split(' ')[1] || ''}
                </span>
              </div>

              {/* LOS Letter Grade */}
              <div className="bg-black/30 rounded-lg border border-white/[0.05] p-2 flex flex-col items-center justify-center text-center">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center font-mono font-bold text-lg border transition-all duration-300"
                  style={{
                    backgroundColor: stats ? `${stats.los.color}18` : 'transparent',
                    color: stats ? stats.los.color : '#475569',
                    borderColor: stats ? `${stats.los.color}35` : '#1e293b'
                  }}
                >
                  {stats ? stats.los.grade : '—'}
                </div>
                <span className="text-[8px] font-bold mt-1 uppercase text-slate-500 tracking-widest font-mono">LOS</span>
                <span className="text-[10px] text-slate-200 font-bold font-mono tabular-nums">
                  {stats ? `${stats.avgWait.toFixed(0)}s` : '—'}
                </span>
              </div>

              {/* Active Phase */}
              <div className="bg-black/30 rounded-lg border border-white/[0.05] p-1.5 text-center flex flex-col justify-center min-h-[52px]">
                <span className="text-[8px] text-slate-500 font-bold font-mono uppercase leading-none mb-0.5 tracking-widest">Phase</span>
                <span className="font-mono text-[11px] font-bold truncate" style={{ color: stats ? stats.phColor : '#475569' }}>
                  {stats ? stats.phName.split(' ')[0] : '—'}
                </span>
                <span className="text-[10px] text-slate-300 font-bold font-mono leading-none mt-0.5 tabular-nums">
                  {stats ? `${stats.remaining.toFixed(0)}s` : ''}
                </span>
              </div>

              {/* Congestion */}
              <div className="bg-black/30 rounded-lg border border-white/[0.05] p-1.5 text-center flex flex-col justify-center min-h-[52px]">
                <span className="text-[8px] text-slate-500 font-bold font-mono uppercase leading-none mb-0.5 tracking-widest">Traffic</span>
                <span className="font-mono text-[10px] font-bold truncate" style={{ color: stats ? stats.cong.color : '#475569' }}>
                  {stats ? stats.cong.label : '—'}
                </span>
                <span className="text-[10px] text-slate-300 font-bold font-mono leading-none mt-0.5 tabular-nums">
                  {stats ? `${stats.stopPct.toFixed(0)}%` : ''}
                </span>
              </div>
            </div>
          ))}

        </div>
      </div>

      {/* 📊 DUAL-VALUE PERFORMANCE KPI TILES */}
      <div>
        <SectionTitle helpText="### Performance KPI Matrix\nReal-time comparative performance values:\n- **Avg Wait Delay**: Mean stopped time across approaches.\n- **Max Backlog Delay**: Highest individual vehicle stopped time.\n- **Total Screen Cars**: Number of vehicles currently visible inside the canvas.\n- **Waiting Screen Cars**: Count of stopped vehicles ($\text{speed} < 0.5$ m/s) on the screen.">Performance KPI Matrix</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          <ComparativeStatTile
            label="Avg Wait Delay"
            modelsStats={modelsStats}
            unit="s"
          />
          <ComparativeStatTile
            label="Max Backlog Delay"
            modelsStats={modelsStats}
            unit="s"
          />
          <ComparativeStatTile
            label="Total Screen Cars"
            modelsStats={modelsStats}
            unit=""
            format={(v) => Math.round(v).toString()}
          />
          <ComparativeStatTile
            label="Waiting Screen Cars"
            modelsStats={modelsStats}
            unit=""
            format={(v) => Math.round(v).toString()}
          />
        </div>
      </div>

      {/* 🚗 APPROACH ARM QUEUES COMPARISON */}
      <div>
        <SectionTitle helpText="### Approach Arm Congestion\nApproach lane queue comparison per direction:\n- **Directional arrow**: Visual entry path index (North, South, East, West).\n- **Stopped Percentage**: Calculated ratio of stationary vehicles against total approaching vehicle density per lane.">Approach Arm Congestion</SectionTitle>
        <div className="space-y-1.5">
          {arms.map((arm) => {
            const meta = ARM_META[arm]

            return (
              <div key={arm} className="bg-black/20 border border-white/[0.05] rounded-xl p-2 space-y-1.5">

                {/* Arm label & queue count compare */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 font-mono text-sm w-4 text-center">{meta.arrow}</span>
                    <span className="text-gray-200 font-bold text-xs">{meta.label} Approach</span>
                  </div>
                  <div className="text-[10px] font-mono flex gap-1.5 font-bold">
                    {modelsStats.map(({ key, meta: mMeta }, idx) => {
                      const armVehicles = (getFrameForModel(key)?.vehicles ?? []).filter((v) => v.arm === arm)
                      const armStopped = armVehicles.filter((v) => v.speed < 0.5)
                      return (
                        <span key={key} style={{ color: mMeta.color }} className="flex items-center gap-0.5">
                          {idx > 0 && <span className="text-gray-700 mr-1.5">|</span>}
                          {mMeta.label.split(' ')[0]}: {armStopped.length}
                        </span>
                      )
                    })}
                  </div>
                </div>

                {/* Comparative progress bar gauges */}
                <div className="flex flex-col gap-1.5 text-[10px] font-mono text-gray-300 mt-1">
                  {modelsStats.map(({ key, meta: mMeta }) => {
                    const armVehicles = (getFrameForModel(key)?.vehicles ?? []).filter((v) => v.arm === arm)
                    const armStopped = armVehicles.filter((v) => v.speed < 0.5)
                    const armQueuePct = armVehicles.length > 0 ? (armStopped.length / armVehicles.length) * 100 : 0
                    const barColor = armQueuePct > 60 ? '#f87171' : armQueuePct > 30 ? '#f59e0b' : '#34d399'

                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="w-12 flex-shrink-0 truncate font-semibold" style={{ color: mMeta.color }}>
                          {mMeta.label.split(' ')[0]}
                        </span>
                        <div className="flex-1 h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${armQueuePct}%`, backgroundColor: barColor, opacity: armQueuePct > 0 ? 0.85 : 0 }}
                          />
                        </div>
                        <span className="w-8 text-right font-bold" style={{ color: barColor }}>{armQueuePct.toFixed(0)}%</span>
                      </div>
                    )
                  })}
                </div>

              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
