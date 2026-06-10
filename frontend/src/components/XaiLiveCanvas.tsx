/**
 * XaiLiveCanvas — replaces SimCanvas during RL training.
 *
 * Same 720×560 footprint as SimCanvas so the dashboard layout never shifts.
 *
 * Layout:
 *  ┌──────────────────────────────────────────────┐  ← 220px reward chart
 *  │  Episode reward sparkline (all episodes)     │
 *  │  Training progress bar + best/latest stats   │
 *  ├──────────────────────────────────────────────┤  ← 340px live XAI detail
 *  │  Step · Episode · Phase badge · Reward       │    (header 36px)
 *  ├────────────┬────────────────┬────────────────┤
 *  │ Obs 26-dim │ Action heatmap │ Importance +   │
 *  │ bars       │ 5×7 grid       │ Reward breakdown│
 *  └────────────┴────────────────┴────────────────┘
 */
import React, { useMemo } from 'react'
import { useDecisionStore } from '../store/decisionStore'
import { useSessionStore } from '../store/sessionStore'
import { ActionProbHeatmap } from './ActionProbHeatmap'
import { FeatureImportanceBars } from './FeatureImportanceBars'

const PHASE_HEX: Record<number, string> = {
  0: '#10b981', 1: '#fbbf24', 2: '#2dd4bf', 3: '#fb923c', 4: '#ef4444',
}
const PHASE_BADGE: Record<number, string> = {
  0: 'bg-emerald-500 text-white',
  1: 'bg-amber-400 text-black',
  2: 'bg-teal-400 text-black',
  3: 'bg-orange-400 text-black',
  4: 'bg-red-600 text-white',
}

// ── Reward chart ─────────────────────────────────────────────────────────────

function EpisodeRewardChart({
  history,
}: {
  history: { episode: number; total_reward: number }[]
}) {
  const W = 680; const H = 140; const PAD = 12

  if (history.length < 2) {
    return (
      <div style={{ height: 160 }} className="flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-cyan-700 border-t-cyan-400 rounded-full animate-spin mb-2" />
        <p className="text-sm text-gray-400">Reward chart will appear after 2 episodes</p>
      </div>
    )
  }

  const rewards = history.map((e) => e.total_reward)
  const minR    = Math.min(...rewards)
  const maxR    = Math.max(...rewards)
  const bestR   = Math.max(...rewards)
  const latestR = rewards[rewards.length - 1]
  const rangeR  = maxR - minR || 1

  const xOf = (i: number) => PAD + (i / (history.length - 1)) * (W - PAD * 2)
  const yOf = (r: number) => H - PAD - ((r - minR) / rangeR) * (H - PAD * 2)

  const pts = history.map((e, i) => `${xOf(i)},${yOf(e.total_reward)}`).join(' ')
  const fillPts = `M ${xOf(0)},${H - PAD} ${history.map((e, i) => `L ${xOf(i)},${yOf(e.total_reward)}`).join(' ')} L ${xOf(history.length - 1)},${H - PAD} Z`

  const bestIdx = rewards.indexOf(bestR)

  return (
    <div style={{ height: 160 }}>
      {/* Stats row */}
      <div className="flex items-center gap-6 px-4 py-2">
        <div>
          <p className="text-[9px] text-gray-600 font-mono uppercase">Latest</p>
          <p className={`text-lg font-bold font-mono tabular-nums leading-tight ${latestR >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {latestR >= 0 ? '+' : ''}{latestR.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-gray-600 font-mono uppercase">Best</p>
          <p className="text-lg font-bold font-mono tabular-nums leading-tight text-cyan-400">
            {bestR >= 0 ? '+' : ''}{bestR.toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-gray-600 font-mono uppercase">Episodes</p>
          <p className="text-lg font-bold font-mono tabular-nums leading-tight text-gray-200">
            {history.length}
          </p>
        </div>
        <div className="flex-1" />
        <div className="text-right">
          <p className="text-[9px] text-gray-600 font-mono uppercase">Ep {history[0]?.episode} → {history[history.length - 1]?.episode}</p>
          <p className="text-[10px] text-gray-500 font-mono">Reward over training</p>
        </div>
      </div>

      {/* SVG chart */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="lcGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Zero line */}
        {minR < 0 && maxR > 0 && (
          <line x1={PAD} y1={yOf(0)} x2={W - PAD} y2={yOf(0)}
            stroke="#374151" strokeWidth="1" strokeDasharray="4,4" />
        )}



        {/* Line */}
        <polyline points={pts} fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Best episode dot */}
        <circle cx={xOf(bestIdx)} cy={yOf(bestR)} r="4"
          fill="#fbbf24" stroke="#0b0f17" strokeWidth="1.5" />

        {/* Latest dot */}
        <circle cx={xOf(history.length - 1)} cy={yOf(latestR)} r="4"
          fill="#10b981" stroke="#0b0f17" strokeWidth="1.5" />

        {/* Axis labels */}
        <text x={PAD} y={H - 2} fontSize="9" fill="#4b5563" fontFamily="monospace">
          Ep {history[0]?.episode}
        </text>
        <text x={W - PAD} y={H - 2} fontSize="9" fill="#4b5563" textAnchor="end" fontFamily="monospace">
          Ep {history[history.length - 1]?.episode}
        </text>
      </svg>
    </div>
  )
}

// ── Live decision detail ──────────────────────────────────────────────────────

function LiveDecisionDetail({ d }: { d: NonNullable<ReturnType<typeof useDecisionStore.getState>['liveDecisions']>[0] }) {
  const isPos     = d.reward_total >= 0
  const badge     = PHASE_BADGE[d.action.phase] ?? PHASE_BADGE[4]
  const obsLabels = d.obs.map((o) => o.label)

  const top5 = useMemo(() =>
    d.importance
      .map((v, i) => ({ v, label: d.obs[i]?.label ?? `obs[${i}]` }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 5),
    [d]
  )

  return (
    <div className="flex flex-col" style={{ height: 340 }}>

      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900 border-t border-b border-gray-700 flex-shrink-0">
        <span className="text-gray-500 text-[10px] font-mono uppercase tracking-wider w-[88px] flex-shrink-0">LIVE DECISION</span>
        <span className="text-white text-xs font-bold font-mono tabular-nums w-[76px] flex-shrink-0">Step #{d.step}</span>
        <span className="text-gray-600 text-xs flex-shrink-0">·</span>
        <span className="text-gray-400 text-xs font-mono tabular-nums w-[80px] flex-shrink-0">Episode {d.episode}</span>
        <div className="w-[82px] flex-shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md block text-center truncate ${badge}`}>
            {d.action.phase_name}
          </span>
        </div>
        <span className="text-gray-400 text-xs font-mono tabular-nums w-8 flex-shrink-0 text-right">{d.action.duration_s}s</span>
        <div className="ml-auto flex items-center gap-3">
          <span className={`text-base font-bold font-mono tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
            R: {isPos ? '+' : ''}{d.reward_total.toFixed(3)}
          </span>
          <span className="text-gray-500 text-xs font-mono">V(s): {d.value.toFixed(2)}</span>
        </div>
      </div>

      {/* 3-col body */}
      <div className="flex flex-1 overflow-hidden divide-x divide-gray-800">

        {/* Left: Observation */}
        <div className="flex flex-col overflow-hidden" style={{ width: '30%' }}>
          <div className="px-3 pt-2 pb-1 flex-shrink-0">
            <p className="text-[9px] text-gray-500 font-mono uppercase tracking-widest">Observation (26)</p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-1">
            {d.obs.map((feat) => (
              <div key={feat.label}>
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-[10px] text-gray-400 truncate flex-1 mr-1" title={feat.label}>{feat.label}</span>
                  <span className="text-[10px] font-mono text-gray-300 tabular-nums flex-shrink-0">{feat.value.toFixed(2)}</span>
                </div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.abs(feat.normalised) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Centre: Action probability heatmap */}
        <div className="flex flex-col overflow-hidden" style={{ width: '40%' }}>
          <div className="px-3 pt-2 pb-1 flex-shrink-0">
            <p className="text-[9px] text-gray-500 font-mono uppercase tracking-widest">Action Probabilities</p>
          </div>
          <div className="flex-1 overflow-auto px-3 pb-2">
            <ActionProbHeatmap probs={d.probs} chosenAction={d.action.action_idx} />
          </div>
        </div>

        {/* Right: Importance + reward breakdown */}
        <div className="flex flex-col overflow-hidden" style={{ width: '30%' }}>
          <div className="px-3 pt-2 pb-1 flex-shrink-0">
            <p className="text-[9px] text-gray-500 font-mono uppercase tracking-widest">Top Influences</p>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-3">
            <FeatureImportanceBars importance={d.importance} obsLabels={obsLabels} topN={6} />

            <div>
              <p className="text-[9px] text-gray-500 font-mono uppercase tracking-widest mb-1.5">Reward Components</p>
              <div className="space-y-1">
                {Object.entries(d.reward_parts).map(([key, rawVal]) => {
                  const val   = rawVal as number
                  const isP   = val >= 0
                  const width = Math.min(100, Math.abs(val) * 35)
                  return (
                    <div key={key} className="grid gap-1" style={{ gridTemplateColumns: '80px 1fr 48px' }}>
                      <span className="text-[10px] text-gray-400 font-mono truncate">{key}</span>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden self-center">
                        <div className={`h-full rounded-full ${isP ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{ width: `${width}%` }} />
                      </div>
                      <span className={`text-[10px] font-bold font-mono tabular-nums text-right ${isP ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isP ? '+' : ''}{val.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 pt-1.5 border-t border-gray-700 flex justify-between items-center">
                <span className="text-[10px] text-gray-300 font-semibold">Total</span>
                <span className={`text-sm font-bold font-mono tabular-nums ${isPos ? 'text-emerald-300' : 'text-red-300'}`}>
                  {isPos ? '+' : ''}{d.reward_total.toFixed(3)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function XaiLiveCanvas() {
  const { liveDecisions, liveEpisodeHistory } = useDecisionStore()

  const latest = liveDecisions.length ? liveDecisions[liveDecisions.length - 1] : null

  // Chronological order for sparkline
  const chronoHistory = useMemo(() =>
    [...liveEpisodeHistory].sort((a, b) => a.episode - b.episode),
    [liveEpisodeHistory]
  )

  return (
    <div
      className="bg-gray-950 border border-gray-700 rounded-xl overflow-hidden flex flex-col"
      style={{ width: 720, height: 560 }}
    >
      {/* Top: episode reward chart (220px) */}
      <div style={{ height: 220, flexShrink: 0 }}>
        <EpisodeRewardChart history={chronoHistory} />
      </div>

      {/* Bottom: live XAI decision detail (340px) */}
      {latest ? (
        <LiveDecisionDetail d={latest} />
      ) : (
        <div style={{ height: 340 }}
          className="flex flex-col items-center justify-center border-t border-gray-800">
          <p className="text-gray-400 text-sm">Start training to see live XAI</p>
          <p className="text-gray-600 text-xs mt-1">Observation · Action Probabilities · Feature Importance</p>
        </div>
      )}
    </div>
  )
}
