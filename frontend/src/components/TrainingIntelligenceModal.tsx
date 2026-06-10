/**
 * TrainingIntelligenceModal — training analysis popup.
 * Opens via ReactDOM.createPortal so it always covers the full screen
 * regardless of any ancestor overflow/transform.
 *
 * OVERVIEW (no episode selected):
 *   • Reward Distribution Histogram  — how often each reward bucket was hit
 *   • Phase → Reward Correlation      — which phases earn the most
 *   • Agent Decision Confidence       — how decisive the agent becomes
 *
 * EPISODE DETAIL (episode selected):
 *   Decision timeline · Phase split · Reward components
 *   ← Back button to return to overview
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useDecisionStore } from '../store/decisionStore'
import { ActionProbHeatmap } from './ActionProbHeatmap'
import { FeatureImportanceBars } from './FeatureImportanceBars'
import type { Decision, SimFrame } from '../types'
import { useSocket } from '../hooks/useSocket'
import SimCanvas from './SimCanvas'
import { useSimulationStore } from '../store/simulationStore'
import { useConfigStore } from '../store/configStore'

// ── Phase constants ───────────────────────────────────────────────────────────
const PHASE_NAMES = ['N+S', 'E+W', 'N+E', 'S+W', 'All-Red']
const PHASE_HEX: Record<number, string> = {
  0: '#10b981', 1: '#fbbf24', 2: '#2dd4bf', 3: '#fb923c', 4: '#ef4444',
}

// ── 1. Reward Distribution Histogram ─────────────────────────────────────────
/**
 * Groups all episode rewards into buckets and shows how many episodes
 * fell in each performance tier. Answers: "Is the agent consistently good
 * or still highly variable?" much more clearly than a dense heatmap.
 */
function RewardHistogram({ history }: { history: { episode: number; total_reward: number }[] }) {
  if (history.length < 3)
    return <p className="text-gray-700 text-sm text-center py-4">Needs 3+ episodes</p>

  const rewards = history.map(e => e.total_reward)
  const min = Math.floor(Math.min(...rewards))
  const max = Math.ceil(Math.max(...rewards))
  const range = max - min || 1
  const N_BINS = 12
  const binW = range / N_BINS

  const bins = Array.from({ length: N_BINS }, (_, i) => ({
    lo: min + i * binW,
    hi: min + (i + 1) * binW,
    count: 0,
    pct: 0,
  }))
  rewards.forEach(r => {
    const idx = Math.min(N_BINS - 1, Math.max(0, Math.floor((r - min) / binW)))
    bins[idx].count++
  })
  const maxCount = Math.max(1, ...bins.map(b => b.count))
  bins.forEach(b => { b.pct = b.count / maxCount })

  return (
    <div>
      {/* Bars */}
      <div className="flex items-end gap-1 h-28 mb-1">
        {bins.map((b, i) => {
          const isPos  = b.lo >= 0
          const h      = Math.max(b.count > 0 ? 8 : 0, b.pct * 100)
          const label  = `${b.lo >= 0 ? '+' : ''}${b.lo.toFixed(0)} → ${b.hi >= 0 ? '+' : ''}${b.hi.toFixed(0)}\n${b.count} episodes`
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={label}>
              {b.count > 0 && (
                <span className="text-[8px] text-gray-600 font-mono">{b.count}</span>
              )}
              <div
                className="w-full rounded-t-sm transition-all"
                style={{
                  height: `${h}%`,
                  backgroundColor: isPos ? '#10b981' : '#ef4444',
                  opacity: 0.4 + 0.6 * b.pct,
                  minHeight: b.count > 0 ? 4 : 0,
                }}
              />
            </div>
          )
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex justify-between text-[9px] text-gray-600 font-mono">
        <span>{min >= 0 ? '+' : ''}{min.toFixed(0)}</span>
        <span className="text-gray-500">← reward range →</span>
        <span>{max >= 0 ? '+' : ''}{max.toFixed(0)}</span>
      </div>
      {/* Summary insight */}
      {(() => {
        const positive = rewards.filter(r => r >= 0).length
        const pct = Math.round(positive / rewards.length * 100)
        const high = rewards.filter(r => r >= max * 0.8).length
        return (
          <p className="text-[10px] text-gray-500 mt-2">
            <span className="text-emerald-400 font-medium">{pct}%</span> of episodes earned positive reward ·{' '}
            <span className="text-cyan-400 font-medium">{high}</span> episodes in top 20% tier
          </p>
        )
      })()}
    </div>
  )
}

// ── 2. Phase-Reward Correlation ───────────────────────────────────────────────
function PhaseRewardCorrelation({ byEp }: { byEp: Record<number, Decision[]> }) {
  const all = Object.values(byEp).flat()
  if (!all.length) return <p className="text-gray-700 text-sm">No data yet</p>

  const sums: Record<number, { sum: number; count: number }> = {}
  all.forEach(d => {
    const p = d.action.phase
    if (!sums[p]) sums[p] = { sum: 0, count: 0 }
    sums[p].sum   += d.reward_total
    sums[p].count += 1
  })
  const entries = Object.entries(sums)
    .map(([p, { sum, count }]) => ({ phase: Number(p), avg: sum / count, count }))
    .sort((a, b) => b.avg - a.avg)
  const maxAbs = Math.max(0.01, ...entries.map(e => Math.abs(e.avg)))

  return (
    <div className="space-y-2">
      {entries.map(({ phase, avg, count }) => {
        const isP = avg >= 0
        const w   = Math.round(Math.abs(avg) / maxAbs * 100)
        return (
          <div key={phase}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PHASE_HEX[phase] }} />
                <span className="text-[11px] text-gray-300 font-medium">{PHASE_NAMES[phase]}</span>
                <span className="text-[10px] text-gray-600 font-mono">{count.toLocaleString()} uses</span>
              </div>
              <span className={`text-[11px] font-bold font-mono tabular-nums ${isP ? 'text-emerald-400' : 'text-red-400'}`}>
                {isP ? '+' : ''}{avg.toFixed(2)}
              </span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: PHASE_HEX[phase] }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 3. Agent Decision Confidence ──────────────────────────────────────────────
function ConfidenceChart({ epNums, byEp }: { epNums: number[]; byEp: Record<number, Decision[]> }) {
  const chronoEps = [...epNums].sort((a, b) => a - b)
  const data = chronoEps.map(ep => {
    const decs = byEp[ep] ?? []
    if (!decs.length) return null
    const avgConf = decs.reduce((s, d) => s + (d.probs?.length ? Math.max(...d.probs) : 0), 0) / decs.length
    return { ep, conf: avgConf }
  }).filter(Boolean) as { ep: number; conf: number }[]

  if (data.length < 2) return <p className="text-gray-700 text-sm">Needs 2+ episodes with decisions</p>

  const W = 560; const H = 72; const PAD = 10
  const confs  = data.map(d => d.conf)
  const minC   = Math.min(...confs)
  const maxC   = Math.max(...confs)
  const rangeC = maxC - minC || 0.01
  const xOf    = (i: number) => PAD + (i / (data.length - 1)) * (W - PAD * 2)
  const yOf    = (c: number) => H - PAD - ((c - minC) / rangeC) * (H - PAD * 2)
  const pts    = data.map((d, i) => `${xOf(i)},${yOf(d.conf)}`).join(' ')
  const fill   = `M ${xOf(0)},${H - PAD} ${data.map((d, i) => `L ${xOf(i)},${yOf(d.conf)}`).join(' ')} L ${xOf(data.length - 1)},${H - PAD} Z`
  const latest = confs[confs.length - 1]

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="confG" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3e635" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#a3e635" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#confG)" />
        <polyline points={pts} fill="none" stroke="#a3e635" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx={xOf(data.length - 1)} cy={yOf(latest)} r="3.5" fill="#a3e635" stroke="#111827" strokeWidth="1.5" />
        <text x={PAD} y={H - 2} fontSize="8" fill="#4b5563" fontFamily="monospace">Ep {data[0].ep}</text>
        <text x={W - PAD} y={H - 2} fontSize="8" fill="#4b5563" textAnchor="end" fontFamily="monospace">Ep {data[data.length - 1].ep}</text>
        <text x={xOf(data.length - 1) + 5} y={yOf(latest) + 4} fontSize="9" fill="#a3e635" fontFamily="monospace">
          {Math.round(latest * 100)}%
        </text>
      </svg>
      <p className="text-[9px] text-gray-600 font-mono mt-0.5">
        Near 0% early (random policy) → high % late (decisive/learned policy)
      </p>
    </div>
  )
}

// ── Episode detail sub-components ────────────────────────────────────────────
function DecisionTimeline({ decisions, selected, onSelect }: {
  decisions: Decision[]; selected: Decision | null; onSelect: (d: Decision) => void
}) {
  if (!decisions.length) return <p className="text-gray-600 text-sm">No decision data for this episode</p>
  const maxAbs = Math.max(0.1, ...decisions.map(d => Math.abs(d.reward_total)))

  return (
    <div>
      {/* Bar chart */}
      <div className="flex items-end gap-[2px] h-16">
        {decisions.map((d, i) => {
          const isPos = d.reward_total >= 0
          const h     = Math.max(5, (Math.abs(d.reward_total) / maxAbs) * 60)
          const isSel = selected?.step === d.step
          const bg    = isPos ? PHASE_HEX[d.action.phase] ?? '#10b981' : '#ef4444'
          return (
            <button key={i} onClick={() => onSelect(d)}
              title={`#${d.step} · ${d.action.phase_name} · ${isPos ? '+' : ''}${d.reward_total.toFixed(2)}`}
              className="flex-1 min-w-[4px] rounded-sm transition-all"
              style={{
                height: h,
                backgroundColor: bg,
                opacity: isSel ? 1 : 0.5,
                alignSelf: 'flex-end',
                // Matte outline only — no glow, no shadow
                outline: isSel ? '1.5px solid rgba(255,255,255,0.65)' : 'none',
                outlineOffset: '1px',
              }}
            />
          )
        })}
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[9px] text-gray-600 font-mono mt-1">
        <span>Step 1</span>
        {selected && (
          <span className="text-gray-500">
            Step #{selected.step} of {decisions.length} · click any bar to change
          </span>
        )}
        <span>Step {decisions.length}</span>
      </div>
    </div>
  )
}

// ── Observation feature explanations ─────────────────────────────────────────
interface ObsInfo { what: string; norm: string; high: string; low: string }
const OBS_INFO: Record<string, ObsInfo> = {
  // Per-arm: Queue
  'N Queue (veh)': { what:'Vehicles waiting at the North stop line',   norm:'÷ 60 → 0–1', high:'Heavy North backlog — needs green urgently', low:'North arm clear — green here may be wasted' },
  'S Queue (veh)': { what:'Vehicles waiting at the South stop line',   norm:'÷ 60 → 0–1', high:'Heavy South backlog', low:'South arm clear' },
  'E Queue (veh)': { what:'Vehicles waiting at the East stop line',    norm:'÷ 60 → 0–1', high:'Heavy East backlog', low:'East arm clear' },
  'W Queue (veh)': { what:'Vehicles waiting at the West stop line',    norm:'÷ 60 → 0–1', high:'Heavy West backlog', low:'West arm clear' },
  // Per-arm: Wait proxy
  'N Wait (s)': { what:'Estimated mean wait for North arm (queue ÷ arrival rate)', norm:'÷ 120s → 0–1', high:'Vehicles waiting a long time on North — urgent', low:'North wait is low or arm is empty' },
  'S Wait (s)': { what:'Estimated mean wait for South arm', norm:'÷ 120s → 0–1', high:'Long South wait', low:'South wait is low' },
  'E Wait (s)': { what:'Estimated mean wait for East arm',  norm:'÷ 120s → 0–1', high:'Long East wait',  low:'East wait is low' },
  'W Wait (s)': { what:'Estimated mean wait for West arm',  norm:'÷ 120s → 0–1', high:'Long West wait',  low:'West wait is low' },
  // Per-arm: Arrival rate
  'N Arrival Rate': { what:'Vehicles arriving per second at North approach', norm:'÷ 1 veh/s → 0–1', high:'High North demand — traffic is heavy', low:'Low North demand' },
  'S Arrival Rate': { what:'Vehicles arriving per second at South approach', norm:'÷ 1 veh/s → 0–1', high:'High South demand', low:'Low South demand' },
  'E Arrival Rate': { what:'Vehicles arriving per second at East approach',  norm:'÷ 1 veh/s → 0–1', high:'High East demand',  low:'Low East demand' },
  'W Arrival Rate': { what:'Vehicles arriving per second at West approach',  norm:'÷ 1 veh/s → 0–1', high:'High West demand',  low:'Low West demand' },
  // Per-arm: Just served
  'N Just Served': { what:'Was the North arm green in the immediately preceding decision?', norm:'Binary: 1.0 = yes, 0.0 = no', high:'North was just served — switching now costs 6s lost time', low:'North has NOT been served recently — consider giving it green' },
  'S Just Served': { what:'Was the South arm green last decision?', norm:'Binary: 1.0 = yes, 0.0 = no', high:'South was just served', low:'South not recently served' },
  'E Just Served': { what:'Was the East arm green last decision?',  norm:'Binary: 1.0 = yes, 0.0 = no', high:'East was just served',  low:'East not recently served' },
  'W Just Served': { what:'Was the West arm green last decision?',  norm:'Binary: 1.0 = yes, 0.0 = no', high:'West was just served',  low:'West not recently served' },
  // Delta queues
  'N Queue Δ': { what:'Change in North queue from previous step', norm:'÷ 60, clipped −1→+1', high:'North queue growing — more arriving than cleared', low:'North queue stable or shrinking — good throughput' },
  'S Queue Δ': { what:'Change in South queue from previous step', norm:'÷ 60, clipped −1→+1', high:'South queue growing', low:'South queue stable/shrinking' },
  'E Queue Δ': { what:'Change in East queue from previous step',  norm:'÷ 60, clipped −1→+1', high:'East queue growing',  low:'East queue stable/shrinking' },
  'W Queue Δ': { what:'Change in West queue from previous step',  norm:'÷ 60, clipped −1→+1', high:'West queue growing',  low:'West queue stable/shrinking' },
  // Phase one-hots
  'Phase 0 (N+S)': { what:'Is the current active phase N+S (North-South through)?', norm:'One-hot: 1.0 = active, 0.0 = not active', high:'N+S is the current active green phase', low:'N+S is not currently active' },
  'Phase 1 (E+W)': { what:'Is the current active phase E+W (East-West through)?', norm:'One-hot: 1.0 = active, 0.0 = not active', high:'E+W is currently active', low:'E+W is not active' },
  'Phase 2 (N+E)': { what:'Is the current active phase N+E (diagonal pair)?', norm:'One-hot: 1.0 = active, 0.0 = not active', high:'N+E diagonal is active', low:'N+E is not active' },
  'Phase 3 (S+W)': { what:'Is the current active phase S+W (diagonal pair)?', norm:'One-hot: 1.0 = active, 0.0 = not active', high:'S+W diagonal is active', low:'S+W is not active' },
  'Phase 4 (All-Red)': { what:'Is all-red (no arm served) the current active phase?', norm:'One-hot: 1.0 = active, 0.0 = not active', high:'All-Red is active — no vehicles clearing! Usually bad.', low:'An active phase is serving at least one arm' },
  // Progress
  'Episode Progress': { what:'How far through the 40-decision episode we are', norm:'step ÷ 40 → 0–1', high:'Near episode end — agent may favour conservative actions', low:'Early in episode — agent has time to explore' },
}

// ── Derive actual calculated values from obs array ───────────────────────────
// obs layout: [N Q,W,R,S, S Q,W,R,S, E Q,W,R,S, W Q,W,R,S, NΔ,SΔ,EΔ,WΔ, P0-P4, progress]
const QUEUE_NORM = 60
function getActualCalc(key: string, d: Decision, val: number): string {
  const ov = (i: number) => d.obs[i]?.value ?? 0   // raw normalised value
  const qv = (i: number) => (ov(i) * QUEUE_NORM).toFixed(1)  // denorm queue

  switch (key) {
    case 'delta_queue': {
      const dqNorm   = -val / 2.0
      const nDelta   = (ov(16) * QUEUE_NORM).toFixed(1)
      const sDelta   = (ov(17) * QUEUE_NORM).toFixed(1)
      const eDelta   = (ov(18) * QUEUE_NORM).toFixed(1)
      const wDelta   = (ov(19) * QUEUE_NORM).toFixed(1)
      const totalDelta = ((ov(16)+ov(17)+ov(18)+ov(19)) * QUEUE_NORM).toFixed(1)
      const expArr   = ((ov(2)+ov(6)+ov(10)+ov(14)) * d.action.duration_s).toFixed(1)
      return [
        `ΔQueue per arm:  N=${nDelta}  S=${sDelta}  E=${eDelta}  W=${wDelta}`,
        `Total ΔQueue = ${totalDelta} veh  ·  Expected arrivals ≈ ${expArr} veh`,
        `δ_norm = ${totalDelta} / ${expArr} = ${dqNorm.toFixed(3)}`,
        `Reward = −2.0 × ${dqNorm.toFixed(3)} = ${val.toFixed(3)} ✓`,
      ].join('\n')
    }
    case 'flow_eff': {
      const eff      = val / 3.0
      const dur      = d.action.duration_s
      const lostTime = val < 0 ? 0 : 0   // no loss if no switch (simplified)
      const nGreen   = [2,2,2,2,0][d.action.phase] ?? 0
      const capacity = (0.5 * 3 * dur * nGreen).toFixed(1)
      const served   = (eff * 0.5 * 3 * dur * nGreen).toFixed(1)
      return [
        `Phase ${d.action.phase} (${d.action.phase_name}): ${nGreen} arms green`,
        `Green duration = ${dur}s  ·  Lanes = 3  ·  Sat. flow = 0.5 veh/s`,
        `Capacity = 0.5 × 3 × ${dur}s × ${nGreen} arms = ${capacity} veh`,
        `Served ≈ ${served} veh  →  efficiency = ${eff.toFixed(3)}`,
        `Reward = +3.0 × ${eff.toFixed(3)} = ${val.toFixed(3)} ✓`,
      ].join('\n')
    }
    case 'switch': {
      if (Math.abs(val) < 0.001) return 'Same phase as last step\n−0.15 × 0 = 0.000 ✓'
      const lostNorm = Math.abs(val) / 0.15
      return [
        'Phase changed this step',
        `Lost time = 6s (yellow + all-red clearance)`,
        `lost_penalty = 6s / 6s = ${lostNorm.toFixed(3)}`,
        `Reward = −0.15 × ${lostNorm.toFixed(3)} = ${val.toFixed(3)} ✓`,
      ].join('\n')
    }
    case 'imbalance': {
      const penalty  = -val / 1.5
      const queues   = [0,4,8,12].map(i => ov(i) * QUEUE_NORM)
      const labels   = ['N','S','E','W']
      const qStr     = queues.map((q,i) => `${labels[i]}=${q.toFixed(1)}`).join('  ')
      const maxQ     = Math.max(...queues)
      const minQ     = Math.min(...queues)
      const totalQ   = queues.reduce((a,b) => a+b, 0)
      return [
        `Queues:  ${qStr}`,
        `Max=${maxQ.toFixed(1)}  Min=${minQ.toFixed(1)}  Total=${totalQ.toFixed(1)}`,
        `imbalance = (${maxQ.toFixed(1)} − ${minQ.toFixed(1)}) / ${totalQ.toFixed(1)} = ${penalty.toFixed(3)}`,
        `Reward = −1.5 × ${penalty.toFixed(3)} = ${val.toFixed(3)} ✓`,
      ].join('\n')
    }
    case 'starvation': {
      if (Math.abs(val) < 0.001) return 'No arm starved beyond 12-decision threshold\n−0.8 × 0 = 0.000 ✓'
      const count = Math.round(-val / 0.8)
      return [
        `${count} arm(s) unserved for >12 decisions with queue >3`,
        `starvation_penalty = ${count} arm(s)`,
        `Reward = −0.8 × ${count} = ${val.toFixed(3)} ✓`,
      ].join('\n')
    }
    case 'baseline_gap': {
      if (Math.abs(val) < 0.001) return 'No baseline reference set or episode just started\nbonus = 0.000'
      const ratio    = val / 0.3
      const betterPct = (ratio * 100).toFixed(0)
      return [
        `Episode mean wait vs baseline reference`,
        `improvement_ratio = ${ratio.toFixed(3)}  (${ratio > 0 ? '+' : ''}${betterPct}% vs baseline)`,
        `Reward = +0.3 × clip(${ratio.toFixed(3)}, −1, 1) = ${val.toFixed(3)} ✓`,
      ].join('\n')
    }
    case 'all_red': {
      if (Math.abs(val) < 0.001)
        return `Phase ${d.action.phase} (${d.action.phase_name}) — at least one arm served\n−2.0 × 0 = 0.000 ✓`
      return [
        `Phase 4 (All-Red) chosen — zero vehicles served`,
        `all_red_penalty = 1.0 (flat)`,
        `Reward = −2.0 × 1.0 = ${val.toFixed(3)} ✓`,
      ].join('\n')
    }
    default: return `Value = ${val.toFixed(3)}`
  }
}

// ── Reward component explanations ────────────────────────────────────────────
const REWARD_EXPLANATIONS: Record<string, {
  icon: string; headline: string; formula: string
  inputs: string[]; interpret: (v: number) => string
}> = {
  delta_queue: {
    icon: '📉',
    headline: 'Queue Growth Penalty',
    formula: '−2.0 × (ΔQueue / Expected_Arrivals)',
    inputs: ['N/S/E/W Queue depth', 'Queue Δ features (obs 16-19)', 'Arrival rate × duration'],
    interpret: v => v < -0.5 ? 'Queues grew significantly — agent served less than arrived'
      : v > -0.1 ? 'Queues stable or shrinking — good signal control'
      : 'Moderate queue growth — room to improve',
  },
  flow_eff: {
    icon: '🚦',
    headline: 'Flow Efficiency Bonus',
    formula: '+3.0 × (Vehicles_Cleared / Green_Capacity)',
    inputs: ['Served vehicles this step', 'Lanes per arm', 'Effective green duration (after lost time)', 'Phase (which arms are green)'],
    interpret: v => v >= 2.5 ? 'Near-perfect efficiency — almost all green capacity used'
      : v >= 1.5 ? 'Good flow — more than half capacity cleared'
      : 'Low efficiency — green time wasted on empty arms',
  },
  switch: {
    icon: '🔄',
    headline: 'Phase Switch Penalty',
    formula: '−0.15 × (Lost_Time / 6s)  [only when phase changes]',
    inputs: ['Current phase vs previous phase', 'Lost time = 6s (yellow + all-red)'],
    interpret: v => v === 0 ? 'No switch — agent stayed on same phase (saves lost time)'
      : 'Phase changed — 6s of lost time paid (yellow + all-red clearance)',
  },
  imbalance: {
    icon: '⚖️',
    headline: 'Queue Imbalance Penalty',
    formula: '−1.5 × (max_queue − min_queue) / total_queue',
    inputs: ['N/S/E/W Queue depths', 'Max vs min arm queue comparison'],
    interpret: v => v > -0.05 ? 'Arms balanced — no single arm being starved'
      : v > -0.3 ? 'Mild imbalance — one arm building up'
      : 'Severe imbalance — one arm heavily starved vs others',
  },
  starvation: {
    icon: '⏳',
    headline: 'Arm Starvation Penalty',
    formula: '−0.8 × count(arms unserved > 12 steps with queue > 3)',
    inputs: ['Steps-since-served counter per arm', 'Queue depth per arm', 'Threshold: 12 decisions (~6min)'],
    interpret: v => v === 0 ? 'No arm starved — all arms receiving green within threshold'
      : `${Math.round(Math.abs(v) / 0.8)} arm(s) starved beyond 12-decision threshold`,
  },
  baseline_gap: {
    icon: '🎯',
    headline: 'Baseline Improvement Bonus',
    formula: '+0.3 × clip((Baseline_Wait − Episode_Wait) / Baseline_Wait, −1, 1)',
    inputs: ['Episode mean wait time so far', 'Fixed-time baseline wait reference', 'Cumulative episode progress'],
    interpret: v => v > 0.1 ? 'Beating the baseline — agent is reducing wait vs fixed-time controller'
      : v < -0.05 ? 'Worse than baseline — agent performing below fixed-time reference'
      : 'Near baseline performance',
  },
  all_red: {
    icon: '🚫',
    headline: 'All-Red Phase Penalty',
    formula: '−2.0  [flat penalty whenever phase 4 (All-Red) is chosen]',
    inputs: ['Current phase selection', 'Phase 4 = no arm served'],
    interpret: v => v === 0 ? 'Active phase chosen — agent is serving at least one arm'
      : 'All-Red chosen — agent wasted this decision, no vehicles cleared',
  },
}

// Reusable small ⓘ button + expandable tooltip
function InfoBtn({ id, open, onToggle, color = 'rgba(255,255,255,0.15)' }: {
  id: string; open: boolean; onToggle: (id: string) => void; color?: string
}) {
  return (
    <button onClick={() => onToggle(id)}
      className="flex-shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all"
      style={{
        backgroundColor: open ? color : 'rgba(255,255,255,0.06)',
        color: open ? '#fff' : 'rgba(255,255,255,0.3)',
        border: `1px solid ${open ? color : 'rgba(255,255,255,0.1)'}`,
        fontSize: 7, fontWeight: 700, lineHeight: 1,
      }}>ⓘ</button>
  )
}

/** Premium full XAI breakdown — 3-column layout */
function DecisionFullDetail({ d }: { d: Decision }) {
  const [openInfo, setOpenInfo] = React.useState<string | null>(null)
  const toggleInfo = (id: string) => setOpenInfo(prev => prev === id ? null : id)
  const isPos      = d.reward_total >= 0
  const phaseColor = PHASE_HEX[d.action.phase] ?? '#6b7280'
  const obsLabels  = d.obs.map(o => o.label)

  // Arm color palette for observation bars
  const OBS_COLORS = [
    '#10b981','#10b981','#10b981','#10b981',  // N: emerald
    '#38bdf8','#38bdf8','#38bdf8','#38bdf8',  // S: sky
    '#fb923c','#fb923c','#fb923c','#fb923c',  // E: orange
    '#a78bfa','#a78bfa','#a78bfa','#a78bfa',  // W: violet
    '#6b7280','#6b7280','#6b7280','#6b7280',  // deltas: gray
    '#f59e0b','#f59e0b','#f59e0b','#f59e0b','#f59e0b', // phases: amber
    '#64748b',                                           // progress
  ]

  // Reward component palette
  const REWARD_COLORS: Record<string, string> = {
    delta_queue:  '#38bdf8', flow_eff:    '#10b981',
    switch:       '#f59e0b', imbalance:   '#a78bfa',
    starvation:   '#fb923c', baseline_gap:'#34d399',
    all_red:      '#ef4444',
  }

  const maxAbs = Math.max(0.01, ...Object.values(d.reward_parts).map(v => Math.abs(v as number)))

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: '#0b0c10', border: `1px solid rgba(255,255,255,0.06)` }}>

      {/* ── Accent bar + header ── */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${phaseColor}, transparent)` }} />
      <div className="flex items-center gap-4 px-5 py-3"
        style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.03), transparent)' }}>
        {/* Left: step + phase + duration */}
        <div className="flex items-center gap-2.5">
          <span className="text-gray-500 text-xs font-mono">Step</span>
          <span className="text-white text-xl font-bold font-mono leading-none">#{d.step}</span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
            style={{ backgroundColor: phaseColor, color: [1,3].includes(d.action.phase) ? '#000' : '#fff' }}>
            {d.action.phase_name}
          </span>
          <span className="text-gray-500 text-xs font-mono">{d.action.duration_s}s</span>
          <span className="text-gray-700 text-xs">·</span>
          <span className="text-gray-500 text-xs font-mono">Ep {d.episode}</span>
        </div>
        {/* Right: reward + value */}
        <div className="ml-auto flex items-baseline gap-3">
          <div className="text-right">
            <div className="text-[9px] text-gray-600 font-mono uppercase mb-0.5">Reward</div>
            <div className={`text-2xl font-bold font-mono tabular-nums leading-none ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPos ? '+' : ''}{d.reward_total.toFixed(2)}
            </div>
          </div>
          <div className="text-right border-l border-gray-800 pl-3">
            <div className="text-[9px] text-gray-600 font-mono uppercase mb-0.5">V(s)</div>
            <div className="text-base font-bold font-mono tabular-nums text-gray-300">{d.value.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* ── 3-col body ── */}
      <div className="grid" style={{ gridTemplateColumns: '26% 44% 30%', height: 'calc(65vh - 120px)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>

        {/* ── LEFT: Observations grouped by arm ── */}
        <div className="overflow-y-auto px-4 py-4 custom-scrollbar h-full" style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest mb-3">Observation · 26 inputs</div>

          {[
            { label: 'N Arm', color: '#10b981', feats: d.obs.slice(0, 4) },
            { label: 'S Arm', color: '#38bdf8', feats: d.obs.slice(4, 8) },
            { label: 'E Arm', color: '#fb923c', feats: d.obs.slice(8, 12) },
            { label: 'W Arm', color: '#a78bfa', feats: d.obs.slice(12, 16) },
            { label: 'Queue Δ', color: '#6b7280', feats: d.obs.slice(16, 20) },
            { label: 'Phase', color: '#f59e0b', feats: d.obs.slice(20, 25) },
            { label: 'Progress', color: '#64748b', feats: d.obs.slice(25) },
          ].map(({ label, color, feats }) => (
            <div key={label} className="mb-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color }}>{label}</span>
              </div>
              {feats.map(feat => {
                const obsKey = `obs:${feat.label}`
                const info   = OBS_INFO[feat.label]
                const isOpen = openInfo === obsKey
                const rawVal = (feat.value * (
                  feat.label.includes('Queue (') ? 60
                  : feat.label.includes('Wait')  ? 120
                  : feat.label.includes('Progress') ? 40 : 1
                ))
                return (
                  <div key={feat.label} className="mb-1.5">
                    <div className="flex items-center gap-1.5">
                      {info && <InfoBtn id={obsKey} open={isOpen} onToggle={toggleInfo} color={color} />}
                      <span className="text-[10px] text-gray-500 truncate" style={{ width: info ? 72 : 80, flexShrink: 0 }}
                        title={feat.label.replace(/^[NSEW] /, '')}>
                        {feat.label.replace(/^[NSEW] /, '')}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="h-full rounded-full"
                          style={{ width: `${Math.min(100, Math.abs(feat.normalised) * 100)}%`, backgroundColor: color, opacity: 0.75 }} />
                      </div>
                      <span className="text-[10px] font-mono tabular-nums text-gray-400 flex-shrink-0" style={{ width: 32, textAlign: 'right' }}>
                        {feat.value.toFixed(2)}
                      </span>
                    </div>
                    {isOpen && info && (
                      <div className="ml-5 mt-1 mb-1 rounded p-2 text-[9px] space-y-1"
                        style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}30` }}>
                        <div className="text-gray-300">{info.what}</div>
                        <div className="font-mono text-gray-500 bg-black/20 rounded px-1.5 py-0.5">
                          Normalised: {info.norm}  ·  Actual ≈ {rawVal.toFixed(2)} {feat.label.includes('Queue') ? 'veh' : feat.label.includes('Wait') ? 's' : feat.label.includes('Progress') ? '/40 steps' : ''}
                        </div>
                        <div className={`${feat.value > 0.5 ? 'text-amber-400' : 'text-gray-500'}`}>
                          {feat.value > 0.5 ? `▲ ${info.high}` : `▽ ${info.low}`}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* ── CENTRE: Action heatmap ── */}
        <div className="overflow-y-auto px-4 py-4 custom-scrollbar h-full" style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest mb-3">Action Probabilities</div>
          <ActionProbHeatmap probs={d.probs} chosenAction={d.action.action_idx} highlightChosen={true} />
        </div>

        {/* ── RIGHT: Influences + Reward ── */}
        <div className="overflow-y-auto px-4 py-4 custom-scrollbar h-full">

          {/* Top influences */}
          <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest mb-3">Key Influences</div>
          <div className="space-y-1.5 mb-5">
            {d.importance
              .map((v, i) => ({ v, label: d.obs[i]?.label ?? `obs[${i}]`, color: OBS_COLORS[i] ?? '#6b7280', val: d.obs[i]?.value ?? 0 }))
              .sort((a, b) => b.v - a.v)
              .slice(0, 7)
              .map(({ label, v, color, val }) => {
                const infKey = `inf:${label}`
                const isOpen = openInfo === infKey
                const info   = OBS_INFO[label]
                return (
                  <div key={label}>
                    <div className="flex items-center gap-1.5">
                      {info && <InfoBtn id={infKey} open={isOpen} onToggle={toggleInfo} color={color} />}
                      <span className="text-[10px] text-gray-400 truncate" style={{ width: info ? 80 : 88, flexShrink: 0 }}>{label}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.round(v * 100)}%`, backgroundColor: color, opacity: 0.8 }} />
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono flex-shrink-0" style={{ width: 28, textAlign: 'right' }}>
                        {Math.round(v * 100)}%
                      </span>
                    </div>
                    {isOpen && info && (
                      <div className="ml-5 mt-1 rounded p-2 text-[9px] space-y-1"
                        style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${color}30` }}>
                        <div className="text-gray-300 font-medium">{info.what}</div>
                        <div className="font-mono text-gray-500">
                          Current value: {val.toFixed(3)} (normalised)  ·  Influence: {Math.round(v * 100)}%
                        </div>
                        <div className="text-amber-300 text-[9px]">
                          Why influential: {Math.round(v * 100)}% of the agent's confidence in{' '}
                          <span className="font-medium">{d.action.phase_name}</span> was driven by this input.
                          {val > 0.5 ? ` High value — ${info.high.toLowerCase()}` : ` Low value — ${info.low.toLowerCase()}`}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>

          {/* Reward breakdown with ⓘ info buttons */}
          <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest mb-3">Reward Breakdown</div>
          <div className="space-y-1.5">
            {Object.entries(d.reward_parts).map(([key, rawVal]) => {
              const val   = rawVal as number
              const isP   = val >= 0
              const w     = Math.round(Math.abs(val) / maxAbs * 100)
              const col   = REWARD_COLORS[key] ?? (isP ? '#10b981' : '#ef4444')
              const info  = REWARD_EXPLANATIONS[key]
              const isOpen = openInfo === key

              return (
                <div key={key}>
                  {/* Main row */}
                  <div className="flex items-center gap-1.5">
                    {/* ⓘ toggle */}
                    <InfoBtn id={key} open={isOpen} onToggle={toggleInfo} color={col} />

                    <span className="text-[10px] font-mono text-gray-500 truncate" style={{ width: 70, flexShrink: 0 }}>{key}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <div className="h-full rounded-full" style={{ width: `${w}%`, backgroundColor: col, opacity: isP ? 0.75 : 0.65 }} />
                    </div>
                    <span className={`text-[10px] font-bold font-mono tabular-nums flex-shrink-0 ${isP ? 'text-emerald-400' : 'text-red-400'}`}
                      style={{ width: 38, textAlign: 'right' }}>
                      {isP ? '+' : ''}{val.toFixed(2)}
                    </span>
                  </div>

                  {/* Expandable info card */}
                  {isOpen && info && (
                    <div className="mt-1.5 mb-1 ml-6 rounded-lg p-3 text-[10px] space-y-2"
                      style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${col}35` }}>

                      {/* Title */}
                      <div className="flex items-center gap-1.5">
                        <span>{info.icon}</span>
                        <span className="font-semibold text-gray-200">{info.headline}</span>
                      </div>

                      {/* Formula */}
                      <div>
                        <div className="text-[8px] text-gray-600 uppercase tracking-widest mb-1">Formula</div>
                        <div className="font-mono text-gray-300 bg-black/30 rounded px-2 py-1.5 text-[9px]">
                          {info.formula}
                        </div>
                      </div>

                      {/* Actual calculation with real values */}
                      <div>
                        <div className="text-[8px] text-gray-600 uppercase tracking-widest mb-1">
                          Actual calculation (this step)
                        </div>
                        <div className="rounded px-2 py-2 text-[9px] font-mono space-y-0.5"
                          style={{ background: `${col}10`, border: `1px solid ${col}25` }}>
                          {getActualCalc(key, d, val).split('\n').map((line, i, arr) => (
                            <div key={i}
                              className={i === arr.length - 1
                                ? `font-bold ${isP ? 'text-emerald-300' : 'text-red-300'}`
                                : 'text-gray-400'}>
                              {line}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Interpretation */}
                      <div className="flex items-start gap-1.5 pt-1"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <span className={`font-bold mt-0.5 flex-shrink-0 ${isP ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isP ? '▲' : '▼'}
                        </span>
                        <span className="text-gray-400 italic">{info.interpret(val)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Total reward */}
          <div className="mt-3 pt-3 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="text-xs text-gray-400 font-semibold">Total Reward</span>
            <span className={`text-sm font-bold font-mono tabular-nums ${isPos ? 'text-emerald-300' : 'text-red-300'}`}>
              {isPos ? '+' : ''}{d.reward_total.toFixed(3)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function PhaseDonut({ decisions }: { decisions: Decision[] }) {
  const counts: Record<number, number> = {}
  decisions.forEach(d => { counts[d.action.phase] = (counts[d.action.phase] ?? 0) + 1 })
  const total   = decisions.length || 1
  const entries = Object.entries(counts).map(([p, c]) => ({ phase: Number(p), c, pct: c / total })).sort((a, b) => b.c - a.c)
  const R = 36; const CX = 44; const CY = 44
  let ang = -Math.PI / 2
  return (
    <div className="flex items-center gap-5">
      <svg width={88} height={88} viewBox="0 0 88 88" className="flex-shrink-0">
        {entries.map(({ phase, pct }) => {
          const sweep = pct * 2 * Math.PI
          const x1 = CX + R * Math.cos(ang); const y1 = CY + R * Math.sin(ang)
          ang += sweep
          const x2 = CX + R * Math.cos(ang); const y2 = CY + R * Math.sin(ang)
          return <path key={phase}
            d={`M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${pct > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`}
            fill={PHASE_HEX[phase] ?? '#6b7280'} opacity="0.85" />
        })}
        <circle cx={CX} cy={CY} r={R - 14} fill="#111827" />
        <text x={CX} y={CY + 4} textAnchor="middle" fontSize="11" fill="#e5e7eb" fontFamily="monospace" fontWeight="bold">
          {decisions.length}
        </text>
      </svg>
      <div className="space-y-2 flex-1">
        {entries.map(({ phase, c, pct }) => (
          <div key={phase} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: PHASE_HEX[phase] }} />
            <span className="text-[11px] text-gray-300 w-10">{PHASE_NAMES[phase]}</span>
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.round(pct * 100)}%`, backgroundColor: PHASE_HEX[phase] }} />
            </div>
            <span className="text-[10px] text-gray-500 font-mono w-8 text-right">{Math.round(pct * 100)}%</span>
            <span className="text-[10px] text-gray-700 font-mono w-5 text-right">{c}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RewardComponents({ decisions }: { decisions: Decision[] }) {
  if (!decisions.length) return null
  const keys = Object.keys(decisions[0]?.reward_parts ?? {})
  const avgs: Record<string, number> = {}
  keys.forEach(k => {
    avgs[k] = decisions.reduce((s, d) => s + (d.reward_parts[k as keyof typeof d.reward_parts] as number), 0) / decisions.length
  })
  const maxAbs = Math.max(0.01, ...Object.values(avgs).map(Math.abs))
  return (
    <div className="space-y-2">
      {keys.map(k => {
        const v = avgs[k]; const isP = v >= 0; const w = Math.round(Math.abs(v) / maxAbs * 100)
        return (
          <div key={k} className="grid gap-x-2 items-center" style={{ gridTemplateColumns: '80px 1fr 52px' }}>
            <span className="text-[10px] text-gray-400 font-mono truncate">{k}</span>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${isP ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${w}%` }} />
            </div>
            <span className={`text-[10px] font-bold font-mono tabular-nums text-right ${isP ? 'text-emerald-400' : 'text-red-400'}`}>
              {isP ? '+' : ''}{v.toFixed(2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────
type SortMode  = 'ep_desc' | 'ep_asc' | 'r_desc' | 'r_asc'
type DetailTab = 'timeline' | 'phases' | 'simulate'

export function TrainingIntelligenceModal({ onClose }: { onClose: () => void }) {
  const { liveEpisodeHistory, decisionsByEpisode } = useDecisionStore()

  // UI state from Zustand store
  const selectedEp = useSimulationStore(s => s.intelSelectedEp)
  const setSelectedEp = useSimulationStore(s => s.setIntelSelectedEp)
  const sortMode = useSimulationStore(s => s.intelSortMode)
  const setSortMode = useSimulationStore(s => s.setIntelSortMode)
  const filter = useSimulationStore(s => s.intelFilter)
  const setFilter = useSimulationStore(s => s.setIntelFilter)
  const detailTab = useSimulationStore(s => s.intelDetailTab)
  const setDetailTab = useSimulationStore(s => s.setIntelDetailTab)
  const selectedDecision = useSimulationStore(s => s.intelSelectedDecision)
  const setSelectedDecision = useSimulationStore(s => s.setIntelSelectedDecision)
  const liveReplayExpanded = useSimulationStore(s => s.intelLiveReplayExpanded)
  const setLiveReplayExpanded = useSimulationStore(s => s.setIntelLiveReplayExpanded)

  // Simulation state from Zustand store for the currently selected episode
  const popupFrame = useSimulationStore(s => s.popupFrames[selectedEp ?? -1] ?? null)
  const setPopupFrame = useSimulationStore(s => s.setPopupFrame)
  const popupRunning = useSimulationStore(s => s.popupRunning[selectedEp ?? -1] ?? false)
  const setPopupRunning = useSimulationStore(s => s.setPopupRunning)
  const popupPaused = useSimulationStore(s => s.popupPaused[selectedEp ?? -1] ?? false)
  const setPopupPaused = useSimulationStore(s => s.setPopupPaused)
  const popupSpeed = useSimulationStore(s => s.popupSpeeds[selectedEp ?? -1] ?? 5)
  const setPopupSpeed = useSimulationStore(s => s.setPopupSpeed)
  const popupDuration = useSimulationStore(s => s.popupDurations[selectedEp ?? -1] ?? 600)
  const setPopupDuration = useSimulationStore(s => s.setPopupDuration)
  const popupSimTime = useSimulationStore(s => s.popupSimTimes[selectedEp ?? -1] ?? 0)
  const setPopupSimTime = useSimulationStore(s => s.setPopupSimTime)
  const popupSid = useSimulationStore(s => s.popupSids[selectedEp ?? -1] ?? null)
  const setPopupSid = useSimulationStore(s => s.setPopupSid)
  const clearAllPopups = useSimulationStore(s => s.clearAllPopups)
  const resetIntelUIState = useSimulationStore(s => s.resetIntelUIState)
  const clearBaselineResults = useSimulationStore(s => s.clearBaselineResults)

  const { emit } = useSocket()
  const { simConfig, adverseConfig } = useConfigStore()
  const modelKey = useSimulationStore(s => s.selectedModelSingle)
  const popupSidRef = useRef<string | null>(null)

  // Sync ref with the store value
  useEffect(() => {
    popupSidRef.current = popupSid
  }, [popupSid])

  // Reset UI state to overview on mount, preserving background popup simulations
  useEffect(() => {
    resetIntelUIState()
  }, [resetIntelUIState])

  const startPopupSim = useCallback(() => {
    if (selectedEp === null) return
    
    // Stop any previous popup sim
    if (popupSidRef.current) {
      emit('sim:stop', { session_id: popupSidRef.current })
    }
    const sid = `popup_${selectedEp}_${Date.now()}`
    setPopupSid(selectedEp, sid)
    setPopupFrame(selectedEp, null)
    setPopupSimTime(selectedEp, 0)
    setPopupRunning(selectedEp, false)
    setPopupPaused(selectedEp, false)
    emit('sim:start', {
      session_id: sid,
      model_key: modelKey,
      sim_config: {
        ...simConfig,
        simulation_duration_s: popupDuration,
        sim_speed_multiplier: popupSpeed,
      },
      adverse_config: adverseConfig,
      replay_episode: selectedEp,
    })
  }, [emit, modelKey, simConfig, adverseConfig, popupDuration, popupSpeed, selectedEp, setPopupSid, setPopupFrame, setPopupSimTime, setPopupRunning, setPopupPaused])

  const stopPopupSim = useCallback(() => {
    if (selectedEp === null) return
    if (popupSidRef.current) {
      emit('sim:stop', { session_id: popupSidRef.current })
    }
    setPopupRunning(selectedEp, false)
    setPopupPaused(selectedEp, false)
  }, [emit, selectedEp, setPopupRunning, setPopupPaused])

  const pausePopupSim = useCallback(() => {
    if (selectedEp === null) return
    if (popupSidRef.current) {
      emit('sim:pause', { session_id: popupSidRef.current })
      setPopupPaused(selectedEp, true)
    }
  }, [emit, selectedEp, setPopupPaused])

  const resumePopupSim = useCallback(() => {
    if (selectedEp === null) return
    if (popupSidRef.current) {
      emit('sim:resume', { session_id: popupSidRef.current })
      setPopupPaused(selectedEp, false)
    }
  }, [emit, selectedEp, setPopupPaused])

  const setPopupSimSpeed = useCallback((s: 1|5|10|20) => {
    if (selectedEp === null) return
    setPopupSpeed(selectedEp, s)
    if (popupSidRef.current) {
      emit('sim:speed', { session_id: popupSidRef.current, multiplier: s })
    }
  }, [emit, selectedEp, setPopupSpeed])

  // Simulate button: switch to the Live Replay tab + start isolated popup sim
  const handleSimulate = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (popupRunning) return
    if (selectedEp !== null) {
      setDetailTab('simulate')
      setLiveReplayExpanded(true)
      // small delay to let tab render first
      setTimeout(() => startPopupSim(), 50)
    }
  }

  const byEp = useMemo(() => decisionsByEpisode(), [liveEpisodeHistory.length])

  const sortedEps = useMemo(() => {
    let list = [...liveEpisodeHistory]
    if (filter === 'top10') list = [...list].sort((a, b) => b.total_reward - a.total_reward).slice(0, 10)
    if (filter === 'bot10') list = [...list].sort((a, b) => a.total_reward - b.total_reward).slice(0, 10)
    if (sortMode === 'ep_asc')  list.sort((a, b) => a.episode - b.episode)
    if (sortMode === 'ep_desc') list.sort((a, b) => b.episode - a.episode)
    if (sortMode === 'r_desc')  list.sort((a, b) => b.total_reward - a.total_reward)
    if (sortMode === 'r_asc')   list.sort((a, b) => a.total_reward - b.total_reward)
    return list
  }, [liveEpisodeHistory, sortMode, filter])

  const rewards     = liveEpisodeHistory.map(e => e.total_reward)
  const chronoHist  = useMemo(() => [...liveEpisodeHistory].sort((a, b) => a.episode - b.episode), [liveEpisodeHistory])
  const bestReward  = rewards.length ? Math.max(...rewards) : 0
  const worstReward = rewards.length ? Math.min(...rewards) : 0
  const avgReward   = rewards.length ? rewards.reduce((a, b) => a + b, 0) / rewards.length : 0
  const finalReward = rewards.length ? (rewards[rewards.length - 1] ?? 0) : 0
  const bestEp      = liveEpisodeHistory.find(e => e.total_reward === bestReward)
  const improvPct   = rewards.length >= 2 ? ((finalReward - rewards[0]) / (Math.abs(rewards[0]) || 1) * 100) : 0

  const allEpNums     = liveEpisodeHistory.map(e => e.episode)
  const selectedEpData = selectedEp !== null ? liveEpisodeHistory.find(e => e.episode === selectedEp) : null
  // Fallback: try ep-1 for off-by-one in older recorded sessions
  const selectedDecs  = selectedEp !== null
    ? (byEp[selectedEp] ?? byEp[selectedEp - 1] ?? [])
    : []

  const simulatingEpData = selectedEp !== null ? liveEpisodeHistory.find(e => e.episode === selectedEp) : null
  const simulatingDecs = selectedEp !== null
    ? (byEp[selectedEp] ?? byEp[selectedEp - 1] ?? [])
    : []

  const dominantPhase = (ep: number) => {
    const decs = byEp[ep] ?? byEp[ep - 1] ?? []
    const c: Record<number, number> = {}
    decs.forEach(d => { c[d.action.phase] = (c[d.action.phase] ?? 0) + 1 })
    return Number(Object.entries(c).sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? 0)
  }

  const handleSelectEp = (ep: number) => {
    setSelectedEp(ep)
    setDetailTab('timeline')
    // Auto-select the last decision so XAI shows immediately without needing a tap
    const decs = byEp[ep] ?? byEp[ep - 1] ?? []
    setSelectedDecision(decs.length > 0 ? decs[decs.length - 1] : null)
  }

  const handleBack = () => {
    setSelectedEp(null)
    setSelectedDecision(null)
  }

  const renderTabContent = () => {
    if (detailTab === 'timeline') {
      return (
        <div className="space-y-4">
          {selectedDecs.length > 0 ? (
            <>
              {/* Decision timeline strip — tap any bar to change the XAI below */}
              <div>
                <p className="text-[9px] text-gray-500 font-mono uppercase tracking-widest mb-1.5">
                  Decision Timeline · {selectedDecs.length} steps · Tap a bar to inspect
                </p>
                <DecisionTimeline decisions={selectedDecs} selected={selectedDecision}
                  onSelect={d => setSelectedDecision(d)} />
              </div>
              {/* Full XAI — always shown, updates when bar is tapped */}
              {selectedDecision && (
                <div>
                  <p className="text-[9px] text-gray-500 font-mono uppercase tracking-widest mb-2">
                    Decision #{selectedDecision.step} of {selectedDecs.length} — Full XAI Breakdown
                  </p>
                  <DecisionFullDetail d={selectedDecision} />
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm">
              No decision data for this episode. Decision data is captured live during training — episodes trained before the XAI dashboard was added won't have it.
            </p>
          )}
        </div>
      )
    }

    if (detailTab === 'phases') {
      return selectedDecs.length > 0
        ? <PhaseDonut decisions={selectedDecs} />
        : <p className="text-gray-500 text-sm">No decision data for this episode.</p>
    }

    return null
  }

  const Stat = ({ label, val, sub, color }: { label: string; val: string; sub?: string; color?: string }) => (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-3 text-center">
      <div className="text-[8px] text-slate-400 font-mono uppercase tracking-widest mb-1">{label}</div>
      <div className="text-xl font-bold font-mono tabular-nums leading-none" style={{ color: color ?? '#e5e7eb' }}>{val}</div>
      {sub && <div className="text-[9px] text-slate-500 font-mono mt-1">{sub}</div>}
    </div>
  )

  return ReactDOM.createPortal(
    <div className="studio-theme fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80"
      style={{ backdropFilter: 'blur(8px)' }}>
      <div className="rounded-2xl shadow-2xl flex flex-col w-full max-w-7xl"
        style={{ background: '#0b0c10', border: '1px solid rgba(255,255,255,0.07)', height: '92vh' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 bg-gray-900 flex-shrink-0 rounded-t-2xl">
          <span>🧠</span>
          <h2 className="text-sm font-bold text-white">Training Intelligence</h2>
          <span className="text-gray-600 text-xs">·</span>
          <span className="text-gray-400 text-xs font-mono">
            {liveEpisodeHistory.length} episodes · {Object.values(byEp).flat().length.toLocaleString()} decisions
          </span>
          {/* Back button — only when episode is selected */}
          {selectedEp !== null && (
            <button onClick={handleBack}
              className="flex items-center gap-1.5 ml-2 text-[11px] font-mono px-3 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-colors">
              ← Overview
            </button>
          )}
          <button onClick={onClose}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors text-lg">
            ×
          </button>
        </div>

        {/* Stats row — hidden in expanded Live Replay mode to use full space */}
        <div className={`grid grid-cols-6 gap-2 px-5 py-3 border-b border-gray-800 flex-shrink-0 ${
          liveReplayExpanded && detailTab === 'simulate' ? 'hidden' : ''
        }`}>
          <Stat label="Best Reward"    val={`${bestReward >= 0 ? '+' : ''}${bestReward.toFixed(1)}`}   sub={`Ep ${bestEp?.episode ?? '—'}`} color="#fbbf24" />
          <Stat label="Worst Reward"   val={`${worstReward >= 0 ? '+' : ''}${worstReward.toFixed(1)}`} color="#ef4444" />
          <Stat label="Avg Reward"     val={`${avgReward >= 0 ? '+' : ''}${avgReward.toFixed(1)}`}     color="#60a5fa" />
          <Stat label="Final Reward"   val={`${finalReward >= 0 ? '+' : ''}${finalReward.toFixed(1)}`} color="#10b981" />
          <Stat label="Improvement"    val={`${improvPct >= 0 ? '+' : ''}${improvPct.toFixed(0)}%`}    sub="ep1 → final" color={improvPct >= 0 ? '#34d399' : '#f87171'} />
          <Stat label="Total Episodes" val={liveEpisodeHistory.length.toLocaleString()}                color="#38bdf8" />
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT: Episode browser — hidden when Live Replay is expanded */}
          <div className={`w-60 flex flex-col border-r border-gray-800 flex-shrink-0 transition-all duration-200 ${
            liveReplayExpanded && detailTab === 'simulate' ? 'hidden' : ''
          }`}>
            {/* Filter + sort controls */}
            <div className="px-3 pt-3 pb-2.5 border-b border-gray-800 flex-shrink-0 space-y-2">

              {/* Filter row — pill group */}
              <div className="flex items-center gap-1 bg-gray-900 rounded-lg p-0.5"
                style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                {([
                  { id: 'all',   label: 'All',  icon: null },
                  { id: 'top10', label: 'Top',  icon: '🏆' },
                  { id: 'bot10', label: 'Bot',  icon: '⚠️' },
                ] as { id: 'all'|'top10'|'bot10'; label: string; icon: string|null }[]).map(({ id, label, icon }) => {
                  const active = filter === id
                  return (
                    <button key={id} onClick={() => setFilter(id)}
                      className="flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-[10px] font-medium transition-all"
                      style={{
                        background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                        color: active ? '#f1f5f9' : '#6b7280',
                        boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
                      }}>
                      {icon && <span className="text-[9px]">{icon}</span>}
                      <span>{label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Sort row */}
              <div>
                <div className="grid grid-cols-4 gap-1">
                  {([
                    ['ep_desc', '↓', 'New'],
                    ['ep_asc',  '↑', 'Old'],
                    ['r_desc',  '↓', 'R'],
                    ['r_asc',   '↑', 'R'],
                  ] as [SortMode, string, string][]).map(([m, arrow, lbl]) => {
                    const active = sortMode === m
                    return (
                      <button key={m} onClick={() => setSortMode(m)}
                        className="flex flex-col items-center py-1 rounded-md transition-all"
                        style={{
                          background: active ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${active ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.05)'}`,
                          color: active ? '#67e8f9' : '#4b5563',
                        }}>
                        <span className="text-[10px] font-bold leading-none">{arrow}</span>
                        <span className="text-[8px] font-mono mt-0.5 leading-none">{lbl}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-1">
              {sortedEps.map(ep => {
                const isPos  = ep.total_reward >= 0
                const isBest = ep.total_reward === bestReward
                const isSel  = ep.episode === selectedEp
                const phase  = dominantPhase(ep.episode)
                return (
                  <button key={ep.episode} onClick={() => handleSelectEp(ep.episode)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg my-0.5 transition-all border text-left
                      ${isSel ? 'bg-cyan-950/30 border-cyan-800/60' : 'border-transparent hover:bg-gray-800 hover:border-gray-700'}`}>
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PHASE_HEX[phase] }} />
                    <span className={`text-[11px] font-mono font-bold tabular-nums flex-shrink-0 ${isSel ? 'text-cyan-400' : 'text-gray-400'}`} style={{ width: 46 }}>
                      Ep {ep.episode}
                    </span>
                    {isBest && <span className="text-[9px]">🏆</span>}
                    <span className={`ml-auto text-[11px] font-bold font-mono tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`} style={{ width: 48, textAlign: 'right' }}>
                      {isPos ? '+' : ''}{ep.total_reward.toFixed(1)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* RIGHT panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedEp === null ? (
              /* ── Overview: 3 unique charts ── */
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                <div className="grid grid-cols-2 gap-4">
                  {/* Reward Distribution */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-white mb-1">Reward Distribution</h3>
                    <p className="text-[10px] text-slate-400 mb-3">How often did each reward level occur?</p>
                    <RewardHistogram history={chronoHist} />
                  </div>

                  {/* Phase → Reward */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <h3 className="text-xs font-bold text-white mb-1">Phase → Avg Reward</h3>
                    <p className="text-[10px] text-slate-400 mb-3">Which phases earned the most across all training?</p>
                    <PhaseRewardCorrelation byEp={byEp} />
                  </div>
                </div>

                {/* Confidence */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-xs font-bold text-white mb-1">Agent Decision Confidence</h3>
                  <p className="text-[10px] text-slate-400 mb-2">
                    Avg max action probability per episode — low early (random), high late (decisive)
                  </p>
                  <ConfidenceChart epNums={allEpNums} byEp={byEp} />
                </div>

                {liveEpisodeHistory.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-2xl mb-2">📊</p>
                    <p className="text-gray-400">Start training to populate these charts</p>
                  </div>
                )}
              </div>
            ) : (
              /* ── Episode detail ── */
              <>
                <div className="px-5 py-3 border-b border-gray-800 bg-gray-900/60 flex-shrink-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-white font-bold text-base">Episode {selectedEp}</span>
                    {selectedEpData && (
                      <>
                        <span className={`text-lg font-bold font-mono tabular-nums ${selectedEpData.total_reward >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {selectedEpData.total_reward >= 0 ? '+' : ''}{selectedEpData.total_reward.toFixed(2)}
                        </span>
                        <span className="text-gray-600">·</span>
                        <span className="text-gray-400 text-sm">{selectedDecs.length} decisions</span>
                        <span className="text-gray-600">·</span>
                        <span className="text-gray-400 text-sm font-mono">Wait: {selectedEpData.mean_wait.toFixed(0)}s</span>
                        {selectedEpData.total_reward === bestReward && (
                          <span className="bg-yellow-500/20 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-full border border-yellow-500/30">🏆 Best</span>
                        )}
                      </>
                    )}
                    {selectedDecs.length > 0 && (
                      <button
                        onClick={handleSimulate}
                        disabled={popupRunning}
                        className={`ml-auto flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                          popupRunning
                            ? 'bg-gray-900 text-gray-500 border-gray-800 cursor-not-allowed opacity-60 shadow-none'
                            : 'bg-cyan-950 hover:bg-cyan-900 text-cyan-400 hover:text-cyan-200 border-cyan-800 cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                        }`}
                        title={popupRunning ? "Simulation is currently running" : "Simulate this training episode in the canvas"}
                      >
                        🎬 {popupRunning ? "Simulating..." : "Simulate"}
                      </button>
                    )}
                  </div>
                 <div className="flex gap-1 mt-2 items-center">
                    {/* Timeline & Phases tabs — always clickable */}
                    {(['timeline', 'phases'] as DetailTab[]).map(t => (
                      <button key={t} onClick={() => { setDetailTab(t); setLiveReplayExpanded(false) }}
                        className={`text-[10px] font-mono px-3 py-1 rounded-md transition-colors ${
                          detailTab === t ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                        }`}>
                        {t === 'timeline' ? '⏱ Decision Timeline' : '🎯 Phase Split'}
                      </button>
                    ))}
                    {/* Live Replay tab — shown as a clickable tab once a simulation has run */}
                    {popupSid !== null && (
                      <div className={`flex items-center gap-1 text-[10px] font-mono pl-3 pr-1.5 py-1 rounded-md border transition-all ${
                        detailTab === 'simulate'
                          ? 'bg-cyan-950 text-cyan-300 border-cyan-800 shadow-[0_0_8px_rgba(6,182,212,0.18)]'
                          : 'bg-gray-800/40 text-gray-400 hover:text-gray-200 border-transparent hover:bg-gray-800 cursor-pointer'
                      }`} onClick={() => setDetailTab('simulate')}>
                        <span>🎬 Live Replay (Ep {selectedEp})</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDetailTab('simulate')
                            setLiveReplayExpanded(!liveReplayExpanded)
                          }}
                          title={liveReplayExpanded && detailTab === 'simulate' ? 'Minimise' : 'Expand to full width'}
                          className="ml-1.5 w-5 h-5 flex items-center justify-center rounded text-cyan-400 hover:text-cyan-100 hover:bg-cyan-900/60 transition-colors text-[12px] cursor-pointer"
                        >
                          {liveReplayExpanded && detailTab === 'simulate' ? '⊟' : '⛶'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                  {detailTab === 'simulate' ? (
                    /* ── Live Replay Tab ──────────────────────────────────────────────────── */
                    liveReplayExpanded ? (

                      /* ══ EXPANDED: 3-column — Inputs | Canvas | Sim Details ══ */
                      <div className="flex h-full overflow-hidden">

                        {/* ── COL 1: Simulation Inputs ────────────────────────── */}
                        <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-800 overflow-y-auto bg-[#0a0b0e]">
                          <div className="px-4 py-3 border-b border-gray-800/60 sticky top-0 bg-[#0a0b0e] z-10">
                            <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Simulation Inputs</div>
                            <div className="text-[9px] text-gray-600 mt-0.5">Everything passed to this replay run</div>
                          </div>
                          <div className="px-4 py-3 space-y-4">

                            {/* Episode Info */}
                            <section>
                              <div className="text-[9px] font-bold text-cyan-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                <span>📋</span> Episode
                              </div>
                              {[
                                ['Episode #',      selectedEp ?? '—'],
                                ['Total Reward',   simulatingEpData ? `${simulatingEpData.total_reward >= 0 ? '+' : ''}${simulatingEpData.total_reward.toFixed(3)}` : '—'],
                                ['Mean Wait',      simulatingEpData ? `${simulatingEpData.mean_wait.toFixed(1)} s` : '—'],
                                ['Throughput',     simulatingEpData ? `${simulatingEpData.throughput ?? '—'} vph` : '—'],
                                ['Steps / Length', simulatingEpData ? simulatingEpData.n_decisions : '—'],
                                ['Decisions',      simulatingDecs.length],
                                ['Rank vs Best',   bestReward > 0 ? `${((simulatingEpData?.total_reward ?? 0) / bestReward * 100).toFixed(1)}%` : '—'],
                              ].map(([k, v]) => (
                                <div key={String(k)} className="flex items-start justify-between py-1 border-b border-gray-800/40">
                                  <span className="text-[10px] text-gray-500 font-mono">{k}</span>
                                  <span className="text-[10px] font-semibold text-gray-200 font-mono tabular-nums text-right max-w-[120px] break-words">{String(v)}</span>
                                </div>
                              ))}
                            </section>

                            {/* Model & Algorithm */}
                            <section>
                              <div className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                <span>🤖</span> Model &amp; Algorithm
                              </div>
                              {[
                                ['Model Key',        modelKey?.toUpperCase() ?? '—'],
                                ['RL Algorithm',     simConfig.rl_algorithm],
                                ['Learning Rate',    simConfig.learning_rate],
                                ['Discount (γ)',     simConfig.discount_factor],
                                ['Hidden Layer',     `${simConfig.hidden_layer_size} units`],
                                ['Total Timesteps',  simConfig.total_timesteps?.toLocaleString() ?? '—'],
                                ['Replay Speed',     `${popupSpeed}× real-time`],
                                ['Replay Duration',  popupDuration < 60 ? `${popupDuration}s` : `${popupDuration/60} min`],
                              ].map(([k, v]) => (
                                <div key={String(k)} className="flex items-start justify-between py-1 border-b border-gray-800/40">
                                  <span className="text-[10px] text-gray-500 font-mono">{k}</span>
                                  <span className="text-[10px] font-semibold text-gray-200 font-mono tabular-nums text-right max-w-[120px] break-words">{String(v)}</span>
                                </div>
                              ))}
                            </section>

                            {/* Traffic Setup */}
                            <section>
                              <div className="text-[9px] font-bold text-amber-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                <span>🚦</span> Traffic Setup
                              </div>
                              {[
                                ['Intersection',    simConfig.intersection_type?.replace('_', ' ')],
                                ['Lanes / Arm',     simConfig.n_lanes],
                                ['Total Flow',      `${simConfig.total_vph?.toLocaleString()} vph`],
                                ['Pattern',         simConfig.traffic_pattern],
                                ['Arrivals',        simConfig.arrival_distribution],
                                ['Cars',            `${simConfig.pct_car}%`],
                                ['2-Wheelers',      `${simConfig.pct_two_wheeler}%`],
                                ['EV Scooters',     `${simConfig.pct_ev_scooter}%`],
                                ['Auto-Rickshaw',   `${simConfig.pct_auto_rickshaw}%`],
                                ['E-Rickshaw',      `${simConfig.pct_e_rickshaw}%`],
                                ['Cabs',            `${simConfig.pct_cab}%`],
                                ['Delivery Bikes',  `${simConfig.pct_delivery_bike}%`],
                                ['TSRTC Bus',       `${simConfig.pct_tsrtc_bus}%`],
                                ['School Bus',      `${simConfig.pct_school_bus}%`],
                                ['Trucks',          `${simConfig.pct_truck}%`],
                              ].map(([k, v]) => (
                                <div key={String(k)} className="flex items-start justify-between py-1 border-b border-gray-800/40">
                                  <span className="text-[10px] text-gray-500 font-mono">{k}</span>
                                  <span className="text-[10px] font-semibold text-gray-200 font-mono tabular-nums text-right">{String(v ?? '—')}</span>
                                </div>
                              ))}
                            </section>

                            {/* Signal Timing */}
                            <section>
                              <div className="text-[9px] font-bold text-green-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                <span>⏱</span> Signal Timing
                              </div>
                              {[
                                ['Phases',          simConfig.n_phases],
                                ['Min Green',       `${simConfig.phase_min_green_s} s`],
                                ['Max Green',       `${simConfig.phase_max_green_s} s`],
                                ['Yellow Time',     `${simConfig.yellow_time_s} s`],
                                ['All-Red Time',    `${simConfig.all_red_time_s} s`],
                                ['Cycle Length',    `${simConfig.cycle_length_s} s`],
                                ['Warm-up Period',  `${simConfig.warm_up_s} s`],
                              ].map(([k, v]) => (
                                <div key={String(k)} className="flex items-start justify-between py-1 border-b border-gray-800/40">
                                  <span className="text-[10px] text-gray-500 font-mono">{k}</span>
                                  <span className="text-[10px] font-semibold text-gray-200 font-mono tabular-nums text-right">{String(v)}</span>
                                </div>
                              ))}
                            </section>

                            {/* Reward Weights */}
                            <section>
                              <div className="text-[9px] font-bold text-rose-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                <span>⚖</span> Reward Weights
                              </div>
                              {[
                                ['Queue penalty',   simConfig.reward_wt_queue],
                                ['Wait penalty',    simConfig.reward_wt_wait],
                                ['Throughput',      simConfig.reward_wt_throughput],
                                ['Collision',       simConfig.reward_wt_collision],
                                ['Pedestrian',      simConfig.reward_wt_pedestrian],
                                ['Emergency',       simConfig.reward_wt_emergency],
                                ['Phase switch',    simConfig.reward_wt_switch],
                              ].map(([k, v]) => (
                                <div key={String(k)} className="flex items-start justify-between py-1 border-b border-gray-800/40">
                                  <span className="text-[10px] text-gray-500 font-mono">{k}</span>
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full bg-rose-500/70" style={{ width: `${Math.min(100, Number(v) / 2 * 100)}%` }} />
                                    </div>
                                    <span className="text-[10px] font-semibold text-gray-200 font-mono tabular-nums w-6 text-right">{String(v)}</span>
                                  </div>
                                </div>
                              ))}
                            </section>

                            {/* Adverse Conditions */}
                            <section>
                              <div className="text-[9px] font-bold text-orange-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                <span>⚠</span> Adverse Conditions
                              </div>
                              {[
                                ['Collision Prob',        `${(adverseConfig.collision_probability * 100).toFixed(1)}%`],
                                ['Rear-end Risk',         adverseConfig.rear_end_risk_factor],
                                ['Red-light Run',         `${(adverseConfig.red_light_run_prob * 100).toFixed(1)}%`],
                                ['Signal Failure',        `${(adverseConfig.signal_failure_prob * 100).toFixed(1)}%`],
                                ['Failure Mode',          adverseConfig.signal_failure_mode?.replace('_', ' ')],
                                ['Waterlogging',          adverseConfig.waterlogging_enabled ? `Yes — severity ${adverseConfig.waterlogging_severity}` : 'Disabled'],
                                ['VIP Convoy',            adverseConfig.vip_convoy_enabled ? `Yes — ${adverseConfig.vip_convoy_frequency_hr}×/hr` : 'Disabled'],
                                ['Camera Dropout',        adverseConfig.camera_dropout_prob > 0 ? `${(adverseConfig.camera_dropout_prob*100).toFixed(1)}%` : 'None'],
                                ['Sensor Noise σ',        adverseConfig.sensor_noise_std > 0 ? adverseConfig.sensor_noise_std : 'None'],
                              ].map(([k, v]) => (
                                <div key={String(k)} className="flex items-start justify-between py-1 border-b border-gray-800/40">
                                  <span className="text-[10px] text-gray-500 font-mono">{k}</span>
                                  <span className="text-[10px] font-semibold text-gray-200 font-mono text-right max-w-[130px] break-words">{String(v ?? '—')}</span>
                                </div>
                              ))}
                            </section>

                          </div>
                        </div>

                        {/* ── COL 2: Canvas ───────────────────────────────────── */}
                        <div className="flex-1 flex flex-col items-center justify-center bg-black/30 overflow-hidden">
                          <SimCanvas
                            width={680}
                            height={540}
                            responsive={true}
                            label={`Replay Ep ${selectedEp ?? ''}`}
                            frameOverride={popupFrame}
                            speedValue={popupSpeed}
                            onSpeedChange={setPopupSimSpeed}
                            onPlayPause={popupRunning ? (popupPaused ? resumePopupSim : pausePopupSim) : startPopupSim}
                            onStop={stopPopupSim}
                            isPaused={popupPaused}
                            isRunning={popupRunning}
                          />
                        </div>

                        {/* ── COL 3: Live Sim Details ─────────────────────────── */}
                        <div className="w-72 flex-shrink-0 flex flex-col border-l border-gray-800 overflow-y-auto bg-[#0a0b0e]">
                          <div className="px-4 py-3 border-b border-gray-800/60 sticky top-0 bg-[#0a0b0e] z-10">
                            <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">Live Sim Details</div>
                            <div className="text-[9px] text-gray-600 mt-0.5">Real-time runtime metrics</div>
                          </div>
                          <div className="px-4 py-3 space-y-4">

                            {/* Time progress */}
                            <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[8px] text-gray-500 font-mono uppercase tracking-widest">⏱ Sim Time</span>
                                <span className="text-[9px] text-gray-500 font-mono">
                                  of {Math.floor(popupDuration/60).toString().padStart(2,'0')}:{(popupDuration%60).toString().padStart(2,'0')}
                                </span>
                              </div>
                              <div className="flex items-baseline justify-between gap-1 mb-2">
                                <span className="text-xl font-bold font-mono text-white tabular-nums leading-none">
                                  {Math.floor(popupSimTime / 60).toString().padStart(2,'0')}:{Math.floor(popupSimTime % 60).toString().padStart(2,'0')}
                                </span>
                                <span className="text-[9px] font-mono text-cyan-400 font-semibold">{Math.min(100, Math.round((popupSimTime / (popupDuration || 1)) * 100))}% complete</span>
                              </div>
                              <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-300"
                                  style={{ width: `${Math.min(100, (popupSimTime / (popupDuration || 1)) * 100)}%` }} />
                              </div>
                            </div>

                            {/* Status badge */}
                            <div className="flex items-center justify-between border-t border-b border-gray-800/40 py-2">
                              <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${
                                  popupRunning && !popupPaused ? 'bg-emerald-400 animate-pulse' :
                                  popupPaused ? 'bg-amber-400' : 'bg-gray-500'
                                }`} />
                                <span className="text-[10px] font-bold tracking-wider font-mono uppercase text-gray-400">
                                  {popupRunning && !popupPaused ? 'Running' : popupPaused ? 'Paused' : 'Idle'}
                                </span>
                              </div>
                              {popupFrame && (
                                <span className="text-[10px] font-mono text-gray-500">
                                  Step <span className="text-gray-300 font-bold">{popupFrame.step}</span>
                                </span>
                              )}
                            </div>

                            {/* Traffic metrics grid */}
                            <div className="grid grid-cols-2 gap-2">
                              {([
                                { label: 'On Canvas',    icon: '🚗', val: popupFrame?.stats?.on_canvas ?? popupFrame?.vehicles.length ?? '—', color: '#60a5fa', span: false },
                                { label: 'In Queue',     icon: '🟥', val: popupFrame?.stats?.in_queue ?? '—', color: '#f87171', span: false },
                                { label: 'Exited',       icon: '✅',  val: popupFrame?.stats?.exited ?? '—', color: '#34d399', span: false },
                                { label: 'Avg Wait',     icon: '⏳',  val: popupFrame?.stats ? `${popupFrame.stats.avg_wait_s.toFixed(1)}s` : '—', color: '#fbbf24', span: false },
                                { label: 'Instant Wait', icon: '⚡',  val: popupFrame?.stats ? `${popupFrame.stats.instant_wait_s.toFixed(1)}s` : '—', color: '#fb923c', span: false },
                                { label: 'Throughput',   icon: '📈',  val: popupFrame?.stats ? `${popupFrame.stats.throughput_vph} vph` : '—', color: '#a78bfa', span: false },
                                { label: 'Instant Flow', icon: '🏹',  val: popupFrame?.stats ? `${popupFrame.stats.instant_tput_vph} vph` : '—', color: '#c084fc', span: false },
                                { label: 'Tick Time',    icon: '🕰',  val: popupFrame?.stats ? `${popupFrame.stats.tick_ms.toFixed(1)}ms` : '—', color: '#94a3b8', span: false },
                                { label: 'Render FPS',   icon: '🎥',  val: popupFrame?.stats ? `${popupFrame.stats.fps} fps` : '—', color: '#67e8f9', span: true },
                              ] as const).map(m => (
                                <div
                                  key={m.label}
                                  className={`bg-gray-900 border border-gray-800/50 rounded-xl p-2.5 flex flex-col justify-between min-h-[56px] transition-all hover:border-gray-700/80 ${
                                    m.span ? 'col-span-2' : ''
                                  }`}
                                >
                                  <span className="text-[9px] text-gray-500 font-mono truncate">{m.icon} {m.label}</span>
                                  <span className="text-xs font-bold font-mono tabular-nums leading-none mt-1" style={{ color: m.color }}>{m.val}</span>
                                </div>
                              ))}
                            </div>

                            {/* Current Signal Phases */}
                            {popupFrame && popupFrame.signals.length > 0 && (
                              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                                <div className="text-[8px] text-gray-500 font-mono uppercase tracking-widest mb-2.5">🚦 Signal Phases</div>
                                <div className="space-y-2">
                                  {popupFrame.signals.map(sig => {
                                    const phaseName = ['N→S Green','E→W Green','N→E Turn','S→W Turn','All-Red'][sig.phase] ?? `Phase ${sig.phase}`
                                    const phaseColor = ['#10b981','#fbbf24','#2dd4bf','#fb923c','#ef4444'][sig.phase] ?? '#9ca3af'
                                    return (
                                      <div key={sig.tl_id} className="border-b border-gray-800/45 pb-1.5 last:border-0 last:pb-0">
                                        <div className="flex items-center justify-between mb-0.5">
                                          <span className="text-[9px] font-bold font-mono" style={{ color: phaseColor }}>{phaseName}</span>
                                          <span className="text-[9px] text-gray-500 font-mono">{sig.duration_s}s total</span>
                                        </div>
                                        <div className="flex items-center justify-between text-[8px]">
                                          <span className="text-gray-500 font-mono uppercase">{sig.tl_id}</span>
                                          <span className="text-amber-500/90 font-mono">{sig.remaining_s != null ? `${sig.remaining_s}s left` : `${sig.elapsed_s}s elapsed`}</span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            {!popupFrame && (
                              <div className="flex flex-col items-center justify-center py-8 text-center">
                                <div className="text-2xl mb-2">🎬</div>
                                <p className="text-[10px] text-gray-600">Simulation loading...<br/>Press Simulate to begin</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                    ) : (

                      /* ══ NORMAL: left=Controls+Metrics, right=Canvas ══ */
                      <div className="flex h-full overflow-hidden">

                        {/* LEFT: Controls + Live Metrics */}
                        <div className="w-72 flex-shrink-0 flex flex-col gap-4 border-r border-gray-800 px-4 py-4 overflow-y-auto bg-[#0a0b0e]">

                          {/* Duration selector */}
                          <div>
                            <div className="text-[9px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Simulation Duration</div>
                            <div className="grid grid-cols-2 gap-1">
                              {([30, 300, 600, 1800] as const).map(d => (
                                <button key={d} onClick={() => selectedEp !== null && setPopupDuration(selectedEp, d)} disabled={popupRunning}
                                  className={`text-[10px] font-mono py-1.5 rounded-lg border transition-all ${
                                    popupDuration === d
                                      ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                                      : 'bg-gray-900 text-gray-500 border-gray-800 hover:text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed'
                                  }`}>
                                  {d < 60 ? `${d}s` : `${d/60}m`}
                                </button>
                              ))}
                            </div>
                          </div>


                          {/* Live Metrics */}
                          <div>
                            <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-3">Live Sim Details</div>
                            <div className="space-y-4">
                              {/* Time progress */}
                              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[8px] text-gray-500 font-mono uppercase tracking-widest">⏱ Sim Time</span>
                                  <span className="text-[9px] text-gray-500 font-mono">
                                    of {Math.floor(popupDuration/60).toString().padStart(2,'0')}:{(popupDuration%60).toString().padStart(2,'0')}
                                  </span>
                                </div>
                                <div className="flex items-baseline justify-between gap-1 mb-2">
                                  <span className="text-xl font-bold font-mono text-white tabular-nums leading-none">
                                    {Math.floor(popupSimTime / 60).toString().padStart(2,'0')}:{Math.floor(popupSimTime % 60).toString().padStart(2,'0')}
                                  </span>
                                  <span className="text-[9px] font-mono text-cyan-400 font-semibold">{Math.min(100, Math.round((popupSimTime / (popupDuration || 1)) * 100))}% complete</span>
                                </div>
                                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 transition-all duration-300"
                                    style={{ width: `${Math.min(100, (popupSimTime / (popupDuration || 1)) * 100)}%` }} />
                                </div>
                              </div>

                              {/* Status badge */}
                              <div className="flex items-center justify-between border-t border-b border-gray-800/40 py-2">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${
                                    popupRunning && !popupPaused ? 'bg-emerald-400 animate-pulse' :
                                    popupPaused ? 'bg-amber-400' : 'bg-gray-500'
                                  }`} />
                                  <span className="text-[10px] font-bold tracking-wider font-mono uppercase text-gray-400">
                                    {popupRunning && !popupPaused ? 'Running' : popupPaused ? 'Paused' : 'Idle'}
                                  </span>
                                </div>
                                {popupFrame && (
                                  <span className="text-[10px] font-mono text-gray-500">
                                    Step <span className="text-gray-300 font-bold">{popupFrame.step}</span>
                                  </span>
                                )}
                              </div>

                              {/* Traffic metrics grid */}
                              <div className="grid grid-cols-2 gap-2">
                                {([
                                  { label: 'On Canvas',    icon: '🚗', val: popupFrame?.stats?.on_canvas ?? popupFrame?.vehicles.length ?? '—', color: '#60a5fa', span: false },
                                  { label: 'In Queue',     icon: '🟥', val: popupFrame?.stats?.in_queue ?? '—', color: '#f87171', span: false },
                                  { label: 'Exited',       icon: '✅',  val: popupFrame?.stats?.exited ?? '—', color: '#34d399', span: false },
                                  { label: 'Avg Wait',     icon: '⏳',  val: popupFrame?.stats ? `${popupFrame.stats.avg_wait_s.toFixed(1)}s` : '—', color: '#fbbf24', span: false },
                                  { label: 'Instant Wait', icon: '⚡',  val: popupFrame?.stats ? `${popupFrame.stats.instant_wait_s.toFixed(1)}s` : '—', color: '#fb923c', span: false },
                                  { label: 'Throughput',   icon: '📈',  val: popupFrame?.stats ? `${popupFrame.stats.throughput_vph} vph` : '—', color: '#a78bfa', span: false },
                                  { label: 'Instant Flow', icon: '🏹',  val: popupFrame?.stats ? `${popupFrame.stats.instant_tput_vph} vph` : '—', color: '#c084fc', span: false },
                                  { label: 'Tick Time',    icon: '🕰',  val: popupFrame?.stats ? `${popupFrame.stats.tick_ms.toFixed(1)}ms` : '—', color: '#94a3b8', span: false },
                                  { label: 'Render FPS',   icon: '🎥',  val: popupFrame?.stats ? `${popupFrame.stats.fps} fps` : '—', color: '#67e8f9', span: true },
                                ] as const).map(m => (
                                  <div
                                    key={m.label}
                                    className={`bg-gray-900 border border-gray-800/50 rounded-xl p-2.5 flex flex-col justify-between min-h-[56px] transition-all hover:border-gray-700/80 ${
                                      m.span ? 'col-span-2' : ''
                                    }`}
                                  >
                                    <span className="text-[9px] text-gray-500 font-mono truncate">{m.icon} {m.label}</span>
                                    <span className="text-xs font-bold font-mono tabular-nums leading-none mt-1" style={{ color: m.color }}>{m.val}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Current Signal Phases */}
                              {popupFrame && popupFrame.signals.length > 0 && (
                                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                                  <div className="text-[8px] text-gray-500 font-mono uppercase tracking-widest mb-2.5">🚦 Signal Phases</div>
                                  <div className="space-y-2">
                                    {popupFrame.signals.map(sig => {
                                      const phaseName = ['N→S Green','E→W Green','N→E Turn','S→W Turn','All-Red'][sig.phase] ?? `Phase ${sig.phase}`
                                      const phaseColor = ['#10b981','#fbbf24','#2dd4bf','#fb923c','#ef4444'][sig.phase] ?? '#9ca3af'
                                      return (
                                        <div key={sig.tl_id} className="border-b border-gray-800/45 pb-1.5 last:border-0 last:pb-0">
                                          <div className="flex items-center justify-between mb-0.5">
                                            <span className="text-[9px] font-bold font-mono" style={{ color: phaseColor }}>{phaseName}</span>
                                            <span className="text-[9px] text-gray-500 font-mono">{sig.duration_s}s total</span>
                                          </div>
                                          <div className="flex items-center justify-between text-[8px]">
                                            <span className="text-gray-500 font-mono uppercase">{sig.tl_id}</span>
                                            <span className="text-amber-500/90 font-mono">{sig.remaining_s != null ? `${sig.remaining_s}s left` : `${sig.elapsed_s}s elapsed`}</span>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              {!popupFrame && (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                  <div className="text-2xl mb-2">🎬</div>
                                  <p className="text-[10px] text-gray-600">Simulation loading...<br/>Press Simulate to begin</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* RIGHT: Canvas */}
                        <div className="flex-1 flex items-center justify-center bg-black/20 overflow-hidden">
                          <SimCanvas
                            width={580}
                            height={460}
                            responsive={true}
                            label={`Replay Ep ${selectedEp ?? ''}`}
                            frameOverride={popupFrame}
                            speedValue={popupSpeed}
                            onSpeedChange={setPopupSimSpeed}
                            onPlayPause={popupRunning ? (popupPaused ? resumePopupSim : pausePopupSim) : startPopupSim}
                            onStop={stopPopupSim}
                            isPaused={popupPaused}
                            isRunning={popupRunning}
                          />
                        </div>
                      </div>
                    )
                  ) : (
                    /* ── Timeline / Phases tabs ─────────────────────────────────────────── */
                    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                      {renderTabContent()}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
