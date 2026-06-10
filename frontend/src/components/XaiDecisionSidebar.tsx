/**
 * XaiDecisionSidebar — fully stable XAI panel during training.
 *
 * Zero resize. Zero layout shift. Fixed pixel heights everywhere.
 *
 * Layout:
 *  ┌──────────────────────────┐  32px  Header
 *  ├──────────────────────────┤ 188px  Latest-decision spotlight (fixed)
 *  ├──────────────────────────┤  72px  Reward sparkline (all episodes, SVG)
 *  ├──────────────────────────┤  36px  Sparkline axis / ep range
 *  ├──────────────────────────┤  32px  "All episodes" header + page counter
 *  ├──────────────────────────┤ 5×44px Episode rows — EXACTLY 5, no growth
 *  ├──────────────────────────┤  36px  Pagination ← → controls
 *  └──────────────────────────┘
 *
 * Click episode row or sparkline dot → DecisionDetailModal popup.
 * Training continues uninterrupted behind the popup.
 */
import React, { useState, useMemo } from 'react'
import { useDecisionStore } from '../store/decisionStore'
import type { Decision } from '../types'
import { DecisionDetailModal } from './DecisionDetailModal'

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

const PAGE_SIZE = 5   // always exactly 5 episode rows

// ─────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────

/** Reward sparkline — fixed 72px tall SVG showing all episode rewards. */
function RewardSparkline({
  history,
  onSelectEp,
}: {
  history: { episode: number; total_reward: number }[]
  onSelectEp: (ep: number) => void
}) {
  if (history.length < 2) return (
    <div className="h-[72px] flex items-center justify-center">
      <span className="text-[10px] text-gray-700 font-mono">Sparkline appears after 2 episodes</span>
    </div>
  )

  const W = 340; const H = 64; const PAD = 6
  const rewards = history.map((e) => e.total_reward)
  const minR = Math.min(...rewards)
  const maxR = Math.max(...rewards)
  const rangeR = maxR - minR || 1

  const xOf = (i: number) => PAD + (i / (history.length - 1)) * (W - PAD * 2)
  const yOf = (r: number) => H - PAD - ((r - minR) / rangeR) * (H - PAD * 2)

  const pts = history.map((e, i) => `${xOf(i)},${yOf(e.total_reward)}`).join(' ')

  return (
    <div className="px-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={72}
        className="cursor-crosshair"
        style={{ display: 'block' }}
      >
        {/* Zero line */}
        {minR < 0 && maxR > 0 && (
          <line
            x1={PAD} y1={yOf(0)} x2={W - PAD} y2={yOf(0)}
            stroke="#374151" strokeWidth="1" strokeDasharray="3,3"
          />
        )}
        {/* Gradient fill */}
        <defs>
          <linearGradient id="xaiGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Line */}
        <polyline points={pts} fill="none" stroke="#06b6d4" strokeWidth="1.5" />
        {/* Click targets (invisible wide bars) */}
        {history.map((e, i) => (
          <rect
            key={e.episode}
            x={xOf(i) - (W / history.length) / 2}
            y={0}
            width={W / history.length}
            height={H}
            fill="transparent"
            onClick={() => onSelectEp(e.episode)}
          />
        ))}
        {/* Latest dot */}
        <circle
          cx={xOf(history.length - 1)}
          cy={yOf(rewards[rewards.length - 1])}
          r="3"
          fill="#06b6d4"
          stroke="#0b0f17"
          strokeWidth="1.5"
        />
      </svg>
      <div className="flex justify-between px-1 -mt-1">
        <span className="text-[9px] text-gray-700 font-mono">Ep {history[0].episode}</span>
        <span className="text-[9px] text-gray-500 font-mono">reward over time</span>
        <span className="text-[9px] text-gray-700 font-mono">Ep {history[history.length - 1].episode}</span>
      </div>
    </div>
  )
}

/** Fixed-height 188px spotlight — never resizes. */
function Spotlight({
  d,
  onOpen,
}: {
  d: Decision
  onOpen: () => void
}) {
  const isPos  = d.reward_total >= 0
  const badge  = PHASE_BADGE[d.action.phase] ?? PHASE_BADGE[4]

  const top3 = useMemo(() =>
    d.importance
      .map((v, i) => ({ v, label: d.obs[i]?.label ?? `obs[${i}]` }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 3),
    [d]
  )

  const topLabel = top3[0]?.label ?? '—'

  return (
    /* Fixed 188px — nothing inside can change this height */
    <div
      className="mx-3 rounded-xl border border-gray-700 bg-gray-900 overflow-hidden"
      style={{ height: 188, flexShrink: 0 }}
    >
      {/* Row 1 — phase + reward (fixed 44px) */}
      <div className="flex items-center gap-2 px-3 border-b border-gray-800" style={{ height: 44 }}>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 ${badge}`}>
          {d.action.phase_name}
        </span>
        <span className="text-gray-400 text-[11px] font-mono flex-shrink-0">{d.action.duration_s}s</span>
        <span className="text-gray-600 text-[10px] font-mono ml-1 flex-shrink-0">#{d.step}</span>
        {/* Fixed-width reward box — no layout shift */}
        <div className="ml-auto w-20 text-right flex-shrink-0">
          <span
            className={`text-xl font-bold font-mono tabular-nums ${isPos ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {isPos ? '+' : ''}{d.reward_total.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Row 2 — why sentence (fixed 28px, one line clamped) */}
      <div className="flex items-center px-3 bg-gray-950/60 border-b border-gray-800" style={{ height: 28 }}>
        <span className="text-[9px] text-cyan-500 font-mono uppercase mr-1.5 flex-shrink-0">Why</span>
        <span className="text-[11px] text-gray-200 truncate">
          Driven by <span className="text-cyan-300 font-medium">{topLabel}</span>
        </span>
      </div>

      {/* Rows 3-5 — exactly 3 influence bars (fixed 28px each = 84px total) */}
      <div className="px-3 py-1.5" style={{ height: 84 }}>
        {top3.map(({ label, v }) => (
          <div key={label} className="flex items-center gap-2" style={{ height: 26 }}>
            <span className="text-[10px] text-gray-400 flex-shrink-0 truncate" style={{ width: 96 }} title={label}>
              {label}
            </span>
            <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${Math.round(v * 100)}%` }} />
            </div>
            <span className="text-[10px] text-gray-500 font-mono tabular-nums flex-shrink-0" style={{ width: 32, textAlign: 'right' }}>
              {Math.round(v * 100)}%
            </span>
          </div>
        ))}
      </div>

      {/* Row 6 — action button (fixed 32px) */}
      <button
        onClick={onOpen}
        className="w-full text-[11px] font-semibold text-cyan-400 hover:text-white hover:bg-cyan-700 bg-gray-800 transition-colors"
        style={{ height: 32 }}
      >
        Open full XAI breakdown →
      </button>
    </div>
  )
}

/** One episode row — fixed 40px. */
function EpisodeRow({
  ep,
  reward,
  nDecisions,
  phase,
  isLatest,
  onClick,
}: {
  ep:         number
  reward:     number
  nDecisions: number
  phase:      number
  isLatest:   boolean
  onClick:    () => void
}) {
  const isPos = reward >= 0
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 rounded-lg transition-colors border ${
        isLatest
          ? 'bg-gray-800 border-gray-600'
          : 'bg-gray-900 border-gray-800 hover:bg-gray-800 hover:border-gray-700'
      }`}
      style={{ height: 40, flexShrink: 0 }}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PHASE_HEX[phase] ?? PHASE_HEX[0] }} />
      <span className={`text-xs font-bold font-mono flex-shrink-0 tabular-nums ${isLatest ? 'text-white' : 'text-gray-400'}`}
            style={{ width: 48 }}>
        Ep {ep}
      </span>
      <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">{nDecisions}d</span>
      <div className="flex-1" />
      <span
        className={`text-sm font-bold font-mono tabular-nums flex-shrink-0 ${isPos ? 'text-emerald-400' : 'text-red-400'}`}
        style={{ width: 72, textAlign: 'right' }}
      >
        {isPos ? '+' : ''}{reward.toFixed(2)}
      </span>
      <span className="text-gray-700 text-xs flex-shrink-0 ml-1">›</span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
//  Main component
// ─────────────────────────────────────────────────────────────

export function XaiDecisionSidebar() {
  const { liveDecisions, liveEpisode, liveEpisodeHistory, decisionsByEpisode } = useDecisionStore()
  const [page, setPage]                 = useState(0)   // 0 = most recent page
  const [modalDecision, setModalDecision] = useState<Decision | null>(null)
  const [modalIdx, setModalIdx]           = useState(0)
  const [modalEpDecisions, setModalEpDecisions] = useState<Decision[]>([])

  const latest = liveDecisions.length ? liveDecisions[liveDecisions.length - 1] : null

  // Sorted episodes newest-first from history
  const sortedEps = useMemo(() =>
    [...liveEpisodeHistory].sort((a, b) => b.episode - a.episode),
    [liveEpisodeHistory]
  )

  const totalPages = Math.max(1, Math.ceil(sortedEps.length / PAGE_SIZE))
  // Clamp page when new episodes arrive
  const safePage = Math.min(page, totalPages - 1)
  const pageEps  = sortedEps.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  // Pad to exactly PAGE_SIZE rows so layout never shifts
  const paddedEps = [
    ...pageEps,
    ...Array(PAGE_SIZE - pageEps.length).fill(null) as null[],
  ]

  const byEp = useMemo(() => decisionsByEpisode(), [liveDecisions.length])

  const dominantPhase = (epNum: number): number => {
    const decs = byEp[epNum] ?? []
    const counts: Record<number, number> = {}
    decs.forEach((d) => { counts[d.action.phase] = (counts[d.action.phase] ?? 0) + 1 })
    const top = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
    return top ? Number(top[0]) : 0
  }

  const openEpisode = (epNum: number) => {
    const decs = byEp[epNum] ?? []
    if (!decs.length) return
    setModalEpDecisions(decs)
    setModalDecision(decs[decs.length - 1])
    setModalIdx(decs.length - 1)
  }

  const openLatest = () => {
    if (!latest) return
    const decs = byEp[latest.episode] ?? []
    setModalEpDecisions(decs.length ? decs : [latest])
    setModalDecision(latest)
    setModalIdx(decs.length ? decs.length - 1 : 0)
  }

  const goPrev = () => {
    if (!modalEpDecisions.length) return
    const next = Math.max(0, modalIdx - 1)
    setModalIdx(next); setModalDecision(modalEpDecisions[next] ?? null)
  }
  const goNext = () => {
    if (!modalEpDecisions.length) return
    const next = Math.min(modalEpDecisions.length - 1, modalIdx + 1)
    setModalIdx(next); setModalDecision(modalEpDecisions[next] ?? null)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-950">

      {/* ── Header (32px fixed) ── */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-4 border-b border-gray-800 bg-gray-900"
        style={{ height: 36 }}
      >
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse flex-shrink-0" />
        <span className="text-xs font-bold text-white tracking-widest">XAI LIVE</span>
        {liveEpisode > 0 && (
          <span className="ml-auto text-[10px] font-mono text-gray-400 tabular-nums">
            {sortedEps.length} ep · {liveDecisions.length} dec
          </span>
        )}
      </div>

      {/* ── Spotlight (188px fixed) ── */}
      <div className="flex-shrink-0 mt-2">
        {latest
          ? <Spotlight d={latest} onOpen={openLatest} />
          : (
            <div
              className="mx-3 rounded-xl border border-gray-800 bg-gray-900 flex flex-col items-center justify-center"
              style={{ height: 188 }}
            >
              <div className="w-7 h-7 border-2 border-cyan-700 border-t-cyan-400 rounded-full animate-spin mb-2" />
              <p className="text-sm text-gray-300">Waiting for training…</p>
              <p className="text-[10px] text-gray-600 mt-1">Decisions appear as the agent trains</p>
            </div>
          )
        }
      </div>

      {/* ── Reward sparkline (all episodes, ~90px fixed) ── */}
      <div className="flex-shrink-0 mt-2">
        <RewardSparkline history={sortedEps.slice().reverse()} onSelectEp={openEpisode} />
      </div>

      {/* ── Episode list header (28px fixed) ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 mt-2"
        style={{ height: 24 }}
      >
        <span className="text-[9px] text-gray-600 font-mono uppercase tracking-wider">
          All episodes — click to inspect
        </span>
        {sortedEps.length > 0 && (
          <span className="text-[9px] text-gray-600 font-mono tabular-nums">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sortedEps.length)} of {sortedEps.length}
          </span>
        )}
      </div>

      {/* ── Episode rows — EXACTLY 5, no growth (5 × 40px = 200px) ── */}
      <div className="flex-shrink-0 px-3 mt-1 space-y-1">
        {paddedEps.map((ep, i) =>
          ep === null ? (
            /* Empty placeholder — keeps height stable */
            <div key={`empty-${i}`} style={{ height: 40 }} />
          ) : (
            <EpisodeRow
              key={ep.episode}
              ep={ep.episode}
              reward={ep.total_reward}
              nDecisions={ep.n_decisions}
              phase={dominantPhase(ep.episode)}
              isLatest={ep.episode === liveEpisode}
              onClick={() => openEpisode(ep.episode)}
            />
          )
        )}
      </div>

      {/* ── Pagination controls (36px fixed) ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 border-t border-gray-800 mt-2"
        style={{ height: 36 }}
      >
        <button
          onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
          disabled={safePage >= totalPages - 1}
          className="text-[11px] font-mono text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded hover:bg-gray-800"
        >
          ← Older
        </button>
        <span className="text-[10px] text-gray-700 font-mono tabular-nums">
          {safePage + 1} / {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.max(p - 1, 0))}
          disabled={safePage <= 0}
          className="text-[11px] font-mono text-gray-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded hover:bg-gray-800"
        >
          Newer →
        </button>
      </div>

      {/* ── Full XAI popup (training runs behind it) ── */}
      {modalDecision && (
        <DecisionDetailModal
          decision={modalDecision}
          totalDecisions={modalEpDecisions.length}
          onPrev={goPrev}
          onNext={goNext}
          onClose={() => setModalDecision(null)}
        />
      )}
    </div>
  )
}
