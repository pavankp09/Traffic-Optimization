import { useMemo } from 'react'
import { useSimulationStore } from '../store/simulationStore'
import { useConfigStore } from '../store/configStore'

// ─── constants ────────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  car: 'Car', two_wheeler: 'Bike', ev_scooter: 'EV Scooter',
  auto_rickshaw: 'Auto', e_rickshaw: 'E-Rick', cab: 'Cab',
  delivery_bike: 'Del. Bike', tsrtc_bus: 'Bus', school_bus: 'Sch. Bus', truck: 'Truck',
}
const ARM_HUE: Record<string, string> = {
  N: '#7ec8e3', S: '#6fcf97', E: '#f2c94c', W: '#f2a25c',
}
const ARM_FULL: Record<string, string> = { N: 'North', S: 'South', E: 'East', W: 'West' }
const SIG_LIT = { green: '#22c55e', yellow: '#facc15', red: '#ef4444' }
const SIG_DARK = { green: '#0e2118', yellow: '#231c08', red: '#20100e' }
const MODEL_DISPLAY_LABELS: Record<string, string> = {
  baseline: 'Baseline',
  rl1: 'RL1 (PPO)',
  rl2: 'RL2 (DQN)',
  rl3: 'RL3 (SAC)',
  rl4: 'RL4 (A2C)',
  custom: 'Custom Agent',
}

function fmtClock(s: number) {
  const hrs = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = Math.floor(s % 60)
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}
function fmtWait(s: number) {
  if (!s || s < 0.05) return '—'
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`
}
function waitCol(s: number) {
  return s > 60 ? '#ff5252' : s > 25 ? '#ffca28' : s > 0.5 ? '#4ade80' : '#4b5563'
}
function sig(arm: string, phase: number): 'green' | 'yellow' | 'red' {
  return ((phase === 0 && (arm === 'N' || arm === 'S')) || (phase === 2 && (arm === 'E' || arm === 'W')))
    ? 'green' : (phase === 1 || phase === 3) ? 'yellow' : 'red'
}

// ─── Compass ─────────────────────────────────────────────────────────────────
function Compass({ queues, phase, total, stopped, size = 130 }: {
  queues: Record<string, number>; phase: number; total: number; stopped: number; size?: number
}) {
  const S = 240, C = 120, RH = 22, ARM = C - RH - 10
  const MAX_Q = 14
  const qpx = (n: number) => Math.min(ARM - 4, (n / MAX_Q) * ARM)
  const st = { N: sig('N', phase), S: sig('S', phase), E: sig('E', phase), W: sig('W', phase) }
  const cong = total > 0 ? stopped / total : 0
  const cc = cong > 0.7 ? '#ff5252' : cong > 0.4 ? '#ffca28' : '#00e676'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${S} ${S}`} display="block" className="mx-auto">
      <defs>
        <radialGradient id="cGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#1e2d42" />
          <stop offset="100%" stopColor="#0b111c" />
        </radialGradient>
        {(['N', 'S', 'E', 'W'] as const).map(a => (
          <linearGradient key={a} id={`q${a}`}
            x1={a === 'W' ? '0%' : a === 'E' ? '100%' : '50%'} y1={a === 'N' ? '0%' : a === 'S' ? '100%' : '50%'}
            x2={a === 'W' ? '100%' : a === 'E' ? '0%' : '50%'} y2={a === 'N' ? '100%' : a === 'S' ? '0%' : '50%'}>
            <stop offset="0%" stopColor={ARM_HUE[a]} stopOpacity="0.05" />
            <stop offset="100%" stopColor={ARM_HUE[a]} stopOpacity="0.55" />
          </linearGradient>
        ))}
      </defs>

      {/* Roads */}
      <rect x={C - RH} y={0} width={RH * 2} height={S} fill="#111a27" />
      <rect x={0} y={C - RH} width={S} height={RH * 2} fill="#111a27" />

      {/* Medians */}
      {([[C, 0, C, C - RH], [C, C + RH, C, S], [0, C, C - RH, C], [C + RH, C, S, C]] as const).map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(250,204,21,0.28)" strokeWidth="1.2" strokeDasharray="5 6" />
      ))}

      {/* Queue fills */}
      {queues.N > 0 && <rect x={C - RH + 2} y={C - RH - qpx(queues.N)} width={RH * 2 - 4} height={qpx(queues.N)} fill={`url(#qN)`} rx={2} style={{ transition: 'all .35s ease' }} />}
      {queues.S > 0 && <rect x={C - RH + 2} y={C + RH} width={RH * 2 - 4} height={qpx(queues.S)} fill={`url(#qS)`} rx={2} style={{ transition: 'all .35s ease' }} />}
      {queues.W > 0 && <rect x={C - RH - qpx(queues.W)} y={C - RH + 2} width={qpx(queues.W)} height={RH * 2 - 4} fill={`url(#qW)`} rx={2} style={{ transition: 'all .35s ease' }} />}
      {queues.E > 0 && <rect x={C + RH} y={C - RH + 2} width={qpx(queues.E)} height={RH * 2 - 4} fill={`url(#qE)`} rx={2} style={{ transition: 'all .35s ease' }} />}

      {/* Stop lines */}
      <line x1={C} x2={C + RH} y1={C - RH} y2={C - RH} stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <line x1={C - RH} x2={C} y1={C + RH} y2={C + RH} stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <line x1={C - RH} x2={C - RH} y1={C} y2={C + RH} stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <line x1={C + RH} x2={C + RH} y1={C - RH} y2={C} stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />

      {/* Box */}
      <rect x={C - RH} y={C - RH} width={RH * 2} height={RH * 2} fill="url(#cGrad)" />
      <rect x={C - RH} y={C - RH} width={RH * 2} height={RH * 2} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />

      {/* Center congestion dot — matte, no drop-shadow */}
      <circle cx={C} cy={C} r={8} fill={`${cc}18`} stroke={`${cc}45`} strokeWidth="1" />
      <circle cx={C} cy={C} r={4} fill={cc} />

      {/* Signal lights — matte flat, thin ring shows active state */}
      {([[C, 9, 'N'], [C, S - 9, 'S'], [9, C, 'W'], [S - 9, C, 'E']] as const).map(([cx, cy, arm]) => (
        <g key={arm}>
          <circle cx={cx} cy={cy} r={7} fill={SIG_DARK[st[arm]]} />
          <circle cx={cx} cy={cy} r={4.5} fill={SIG_LIT[st[arm]]} />
          <circle cx={cx} cy={cy} r={6.5} fill="none" stroke={SIG_LIT[st[arm]]} strokeWidth="1" strokeOpacity="0.35" />
        </g>
      ))}

      {/* Count badges */}
      {(['N', 'S', 'E', 'W'] as const).filter(a => queues[a] > 0).map(arm => {
        const bx = arm === 'N' || arm === 'S' ? C + RH + 3 : arm === 'W' ? C - RH - qpx(queues[arm]) - 2 : C + RH + qpx(queues[arm]) + 2
        const by = arm === 'N' ? C - RH - qpx(queues[arm]) + 8 : arm === 'S' ? C + RH + qpx(queues[arm]) - 3 : C - RH - 3
        return <text key={arm} x={bx} y={by} fill={ARM_HUE[arm]} fontSize="8" fontFamily="monospace" fontWeight="bold" textAnchor={arm === 'E' ? 'start' : 'start'}>{queues[arm]}</text>
      })}

      {/* Arm labels */}
      <text x={C - RH - 3} y={13} fill="rgba(148,163,184,0.9)" fontSize="9" fontFamily="monospace" textAnchor="end" fontWeight="600">N</text>
      <text x={C - RH - 3} y={S - 3} fill="rgba(148,163,184,0.9)" fontSize="9" fontFamily="monospace" textAnchor="end" fontWeight="600">S</text>
      <text x={4} y={C - RH - 2} fill="rgba(148,163,184,0.9)" fontSize="9" fontFamily="monospace" fontWeight="600">W</text>
      <text x={S - 4} y={C - RH - 2} fill="rgba(148,163,184,0.9)" fontSize="9" fontFamily="monospace" textAnchor="end" fontWeight="600">E</text>
    </svg>
  )
}

// ─── tiny pieces ─────────────────────────────────────────────────────────────
function SecLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <span className="w-0.5 h-2.5 rounded-full bg-[#7ec8e3] opacity-70 flex-shrink-0" />
      <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-300 font-mono">{children}</span>
    </div>
  )
}

function StatCell({ label, value, sub, color, align = 'left', bordered = false }: {
  label: string; value: string; sub?: string; color?: string; align?: 'left' | 'right'; bordered?: boolean
}) {
  const borderStyle = bordered
    ? 'bg-white/[0.02] border border-white/[0.04] py-1 px-2 rounded-lg'
    : ''
  return (
    <div className={`flex flex-col justify-between ${borderStyle} ${align === 'right' ? 'items-end text-right' : ''}`}>
      <span className="text-[7.5px] font-mono uppercase tracking-wider text-slate-400 font-bold leading-none truncate w-full">{label}</span>
      <span className="text-[13px] font-extrabold font-mono tabular-nums leading-none my-0.5" style={{ color: color ?? '#f1f5f9' }}>{value}</span>
      <span className="text-[6.5px] font-mono text-slate-500 leading-none truncate w-full">{sub}</span>
    </div>
  )
}

// ─── main ────────────────────────────────────────────────────────────────────
export default function SimLiveStatsPanel({ modelKey }: { modelKey?: string }) {
  const selectedModelSingle = useSimulationStore(s => s.selectedModelSingle)
  const activeModelKey = modelKey ?? selectedModelSingle

  const isRunning = useSimulationStore(s => s.isRunning)
  const globalSimTimeS = useSimulationStore(s => s.simTimeS)
  const lastMetrics = useSimulationStore(s => s.lastSimulationMetrics[activeModelKey])
  const { simConfig } = useConfigStore()

  const activeFrame = useSimulationStore(s => {
    switch (activeModelKey) {
      case 'baseline': return s.baselineFrame
      case 'rl1': return s.rl1Frame
      case 'rl2': return s.rl2Frame
      case 'rl3': return s.rl3Frame
      case 'rl4': return s.rl4Frame
      case 'custom': return s.customFrame
      default: return s.baselineFrame
    }
  })

  const simTimeS = activeFrame?.sim_time_s ?? globalSimTimeS
  const veh = activeFrame?.vehicles ?? []
  const phase = activeFrame?.signals?.[0]?.phase ?? 4
  const maxDur = activeFrame?.max_sim_time_s ?? Number(simConfig.simulation_duration_s ?? 1800)
  const pct = maxDur > 0 ? Math.min(1, simTimeS / maxDur) : 0

  const queues = useMemo(() => {
    const m: Record<string, number> = { N: 0, S: 0, E: 0, W: 0 }
    veh.forEach(v => { if (v.arm in m && (v.speed ?? 0) < 0.5) m[v.arm]++ })
    return m
  }, [veh])
  const maxQ = Math.max(...Object.values(queues), 1)

  const total = veh.length
  const stopped = veh.filter(v => (v.speed ?? 0) < 0.5).length
  const moving = total - stopped
  const flowPct = total > 0 ? moving / total : 0

  // Authoritative aggregate stats from the backend (demand-backlog model).
  // Falls back to derived values only if the backend hasn't sent stats yet.
  const agg = activeFrame?.stats
  const onCanvas = agg?.on_canvas ?? total
  const inQueue = agg?.in_queue ?? total
  const exited = agg?.exited ?? (simTimeS > 0 ? Math.round((lastMetrics?.throughput_vph ?? 0) * (simTimeS / 3600)) : 0)
  const avgWait = agg?.avg_wait_s ?? (lastMetrics?.avg_wait_s ?? 0)
  const instantWait = agg?.instant_wait_s ?? avgWait
  const tput = agg?.throughput_vph ?? (lastMetrics?.throughput_vph ?? 0)
  const instantTput = agg?.instant_tput_vph ?? tput
  const tickMs = agg?.tick_ms ?? 0
  const fps = agg?.fps ?? 0

  const los = useMemo(() => {
    if (avgWait <= 10) return { grade: 'A', color: '#4ade80', desc: 'Free flow' }
    if (avgWait <= 20) return { grade: 'B', color: '#34d399', desc: 'Stable' }
    if (avgWait <= 35) return { grade: 'C', color: '#a3e635', desc: 'Acceptable' }
    if (avgWait <= 55) return { grade: 'D', color: '#f59e0b', desc: 'Heavy' }
    if (avgWait <= 80) return { grade: 'E', color: '#f97316', desc: 'At Capacity' }
    return { grade: 'F', color: '#ef4444', desc: 'Saturated' }
  }, [avgWait])

  const nTotal = exited + onCanvas
  const sysWaitSecs = avgWait * nTotal
  const fuelLiters = (sysWaitSecs / 3600.0) * 0.7
  const co2Kg = fuelLiters * 2.31
  const greenEffPct = Math.max(12.5, Math.min(98.2, 100 - (total > 0 ? (stopped / total) * 100 : 0)))

  const runTimestamp = useMemo(() => {
    const d = new Date()
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    return `${dateStr}, ${timeStr}`
  }, [activeFrame?.session_id])

  const waitByType = useMemo(() => {
    const m: Record<string, { t: number, c: number }> = {}
    veh.forEach(v => {
      const k = v.type_id ?? 'car'
      if (!m[k]) m[k] = { t: 0, c: 0 }
      m[k].t += v.wait_time ?? 0; m[k].c++
    })
    return Object.entries(m)
      .map(([k, { t, c }]) => ({ k, lbl: TYPE_LABELS[k] ?? k, avg: c ? t / c : 0, cnt: c }))
      .filter(e => e.cnt > 0).sort((a, b) => b.avg - a.avg).slice(0, 6)
  }, [veh])

  const waitByArm = useMemo(() => (
    (['N', 'S', 'E', 'W'] as const).map(arm => {
      const av = veh.filter(v => v.arm === arm)
      return { arm, avg: av.length ? av.reduce((s, v) => s + (v.wait_time ?? 0), 0) / av.length : 0, cnt: av.length }
    })
  ), [veh])

  // True idle = never run yet (no frame at all)
  const neverRun = !isRunning && !activeFrame
  // hasLastRun = sim ended but we still have data to show
  const isCompleted = !isRunning && !!activeFrame

  // Status dot + label
  const statusDot = isRunning ? 'bg-[#22c55e]' : isCompleted ? 'bg-[#facc15]' : 'bg-slate-700'
  const displayLabel = MODEL_DISPLAY_LABELS[activeModelKey] ?? 'RL Agent'
  const statusText = isRunning ? `· Live · ${displayLabel}`
    : isCompleted ? `· Completed · ${displayLabel}`
      : '· Awaiting'

  // Policy mode from the latest frame
  const policyMode = activeFrame?.policy_mode ?? null

  // Policy badge config — the most important indicator in the whole UI
  const policyBadge =
    policyMode === 'model'
      ? { text: '⚡ Neural Model', bg: 'bg-[#4ade80]/[0.12]', border: 'border-[#4ade80]/30', color: 'text-[#4ade80]' }
      : policyMode === 'heuristic'
        ? { text: '~ Heuristic', bg: 'bg-[#facc15]/[0.08]', border: 'border-[#facc15]/25', color: 'text-[#facc15]' }
        : policyMode === 'fixed_time'
          ? { text: '⏱ Fixed-Time', bg: 'bg-[#8fb8ce]/[0.08]', border: 'border-[#8fb8ce]/20', color: 'text-[#8fb8ce]' }
          : policyMode === 'websters'
            ? { text: '📐 Webster\'s', bg: 'bg-[#f59e0b]/[0.08]', border: 'border-[#f59e0b]/20', color: 'text-[#f59e0b]' }
            : null

  return (
    <div className="w-[560px] h-[560px] bg-[#0b0f18] border border-white/[0.08] rounded-2xl flex flex-col gap-0 select-none overflow-hidden">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] bg-[#0d1220] flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
          <span className="text-[12px] font-semibold text-white tracking-tight">Live Telemetry</span>
          <span className="text-[9px] text-slate-500 font-mono">{statusText}</span>
          {/* Policy mode badge — immediately visible, colour-coded */}
          {policyBadge && (
            <span className={`text-[8px] font-mono font-bold px-2 py-0.5 rounded-md border ${policyBadge.bg} ${policyBadge.border} ${policyBadge.color} uppercase tracking-wider`}>
              {policyBadge.text}
            </span>
          )}
        </div>
        <div className="text-right">
          <span className="text-[14px] font-bold font-mono tabular-nums text-[#7ec8e3]">{fmtClock(simTimeS)}</span>
          <span className="text-[9px] text-slate-600 font-mono ml-1">/ {fmtClock(maxDur)}</span>
        </div>
      </div>

      {neverRun ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
          <div className="w-12 h-12 rounded-full border border-white/[0.07] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-slate-700">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M12 7v5l3 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-slate-700 leading-relaxed">
            Start the simulation<br />to stream live telemetry
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">

          {/* Completed run banner — subtle strip shown after sim ends */}
          {isCompleted && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-[#facc15]/[0.04] border-b border-[#facc15]/[0.10] flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#facc15]/60 flex-shrink-0" />
              <span className="text-[9px] font-mono text-[#facc15]/60 uppercase tracking-widest">
                Last run complete · {fmtClock(simTimeS)} elapsed · Run at {runTimestamp}
              </span>
            </div>
          )}

          <div className="flex-1 flex gap-4 p-4 min-h-0 bg-[#0b0f18]">

            {/* Left Column: w-[230px] */}
            <div className="w-[230px] flex flex-col gap-4 min-h-0">
              {/* Compass (Top) */}
              <div className="h-[210px] flex items-center justify-center relative bg-white/[0.01] border border-white/[0.03] rounded-2xl flex-shrink-0">
                <Compass queues={queues} phase={phase} total={total} stopped={stopped} size={185} />
              </div>

              {/* Live Stats (Bottom) */}
              <div className="flex-1 flex flex-col min-h-0">
                <SecLabel>Live Stats</SecLabel>
                <div className="grid grid-cols-2 gap-1.5 mt-1">
                  <StatCell label="Canvas" sub="on screen" value={onCanvas.toLocaleString()} bordered />
                  <StatCell label="Queue" sub="total" value={inQueue.toLocaleString()} bordered />
                  <StatCell label="Inst Wait" sub="5m window" value={fmtWait(instantWait)} color={waitCol(instantWait)} bordered />
                  <StatCell label="Inst Tput" sub="5m window" value={Math.round(instantTput).toLocaleString()} color="#facc15" bordered />
                  <StatCell label="Exited" sub="passed" value={exited.toLocaleString()} color="#97b9a7" bordered />
                  <StatCell label="LOS Grade" sub={los.desc} value={`Grade ${los.grade}`} color={los.color} bordered />
                  <StatCell label="Fuel Wasted" sub="idle est" value={`${fuelLiters.toFixed(1)} L`} color="#f87171" bordered />
                  <StatCell label="CO2 Output" sub="carbon est" value={`${co2Kg.toFixed(1)} kg`} color="#fb923c" bordered />
                </div>
              </div>
            </div>

            {/* Right Column: flex-1 */}
            <div className="flex-1 flex flex-col gap-2.5 min-h-0">
              {/* Queue depths */}
              <div className="flex-shrink-0">
                <SecLabel>Queue Depths</SecLabel>
                <div className="space-y-1.5">
                  {(['N', 'S', 'E', 'W'] as const).map(arm => {
                    const c = queues[arm]
                    const pct2 = (c / maxQ) * 100
                    return (
                      <div key={arm} className="flex items-center gap-2">
                        <span className="w-3 text-[9px] font-bold font-mono text-right flex-shrink-0"
                          style={{ color: ARM_HUE[arm] }}>{arm}</span>
                        <div className="flex-1 h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300"
                            style={{ width: `${pct2}%`, backgroundColor: ARM_HUE[arm], opacity: c > 0 ? 1 : 0 }} />
                        </div>
                        <span className="w-5 text-right text-[10px] font-bold font-mono tabular-nums flex-shrink-0"
                          style={{ color: c > 0 ? ARM_HUE[arm] : '#374151' }}>{c}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Wait by approach */}
              <div className="flex-shrink-0 border-t border-white/[0.06] pt-1.5">
                <SecLabel>Wait by Approach</SecLabel>
                <div className="space-y-1.5">
                  {waitByArm.map(({ arm, avg, cnt }) => (
                    <div key={arm} className="flex items-center gap-2">
                      <span className="w-8 text-[9px] font-mono font-semibold flex-shrink-0"
                        style={{ color: ARM_FULL[arm] ? ARM_HUE[arm] : '#94a3b8' }}>{ARM_FULL[arm]}</span>
                      <div className="flex-1 h-1 bg-white/[0.07] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-400"
                          style={{ width: `${avg > 0 ? Math.min(100, (avg / 90) * 100) : 0}%`, backgroundColor: waitCol(avg), opacity: 0.9 }} />
                      </div>
                      <span className="w-10 text-right text-[9px] font-bold font-mono tabular-nums flex-shrink-0"
                        style={{ color: waitCol(avg) }}>{fmtWait(avg)}</span>
                      <span className="w-3 text-right text-[8px] font-mono text-slate-600 tabular-nums flex-shrink-0">{cnt}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Wait / Vehicle Type */}
              <div className="flex-shrink-0 border-t border-white/[0.06] pt-1.5">
                <SecLabel>Wait / Vehicle Type</SecLabel>
                {waitByType.length === 0 ? (
                  <p className="text-[9px] text-slate-700 font-mono py-1">No vehicles yet</p>
                ) : (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {waitByType.map(e => (
                      <div key={e.k} className="flex items-center justify-between gap-1">
                        <span className="text-[8.5px] font-mono text-slate-400 truncate">{e.lbl}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[9px] font-bold font-mono tabular-nums"
                            style={{ color: waitCol(e.avg) }}>{fmtWait(e.avg)}</span>
                          <span className="text-[7.5px] font-mono text-slate-600">·{e.cnt}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Signal Phase (Bottom) */}
              <div className="flex-shrink-0 border-t border-white/[0.06] pt-1.5">
                <div className="flex flex-col">
                  <SecLabel>Signal Phase</SecLabel>
                  <div className="flex gap-4 items-center justify-between -mt-1.5">
                    {/* Active Signal Stats Card */}
                    <div className="flex-1 bg-white/[0.02] border border-white/[0.04] p-3 rounded-xl flex items-center justify-between h-[52px]">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[7.5px] font-mono uppercase tracking-widest text-slate-400 font-semibold leading-none">Active Phase</span>
                        <span className="text-[12px] font-bold text-slate-200 mt-1 leading-none">
                          {phase === 0 ? 'N–S Green' : phase === 1 ? 'N–S Yellow' : phase === 2 ? 'E–W Green' : phase === 3 ? 'E–W Yellow' : 'All Red'}
                        </span>
                      </div>
                      <div className="text-right flex flex-col gap-0.5">
                        <span className="text-[7.5px] font-mono uppercase tracking-widest text-slate-400 leading-none">Remaining</span>
                        <span className="text-[13px] font-bold font-mono text-[#facc15] mt-1 leading-none">
                          {activeFrame?.signals?.[0]?.remaining_s?.toFixed(0) ?? '—'}s
                        </span>
                      </div>
                    </div>

                    {/* Signal Phase Actuator Dots */}
                    <div className="grid grid-cols-4 gap-1 w-[120px] flex-shrink-0">
                      {(['N', 'S', 'E', 'W'] as const).map(arm => {
                        const state = sig(arm, phase)
                        return (
                          <div key={arm} className="flex flex-col items-center gap-0.5 bg-white/[0.03] rounded-lg py-1 border border-white/[0.05]">
                            <span className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-offset-0"
                              style={{ backgroundColor: SIG_LIT[state], opacity: 0.9, outline: `1.5px solid ${SIG_LIT[state]}44`, outlineOffset: '1.5px' }} />
                            <span className="text-[7.5px] font-mono font-bold mt-0.5 leading-none" style={{ color: ARM_HUE[arm] }}>{arm}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actuator Card */}
              <div className="flex-shrink-0 border-t border-white/[0.06] pt-1.5">
                <div className="bg-white/[0.02] border border-white/[0.04] py-1.5 px-3 rounded-lg flex items-center justify-between">
                  <span className="text-[7.5px] font-mono uppercase tracking-wider text-slate-400 font-bold leading-none">Actuator</span>
                  <div className="flex items-center gap-2.5 font-mono leading-none">
                    <span className="text-[13px] font-extrabold text-slate-200">{fps.toFixed(1)} FPS</span>
                    <span className="text-slate-700 text-[10px]">|</span>
                    <span className="text-[11px] font-bold text-slate-400">tick: {tickMs.toFixed(0)}ms</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
