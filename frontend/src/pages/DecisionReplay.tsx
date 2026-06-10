/**
 * DecisionReplay — full-page post-training episode replay.
 *
 * Layout:
 *   Top bar:    session info + best reward + convergence badge
 *   Main area:  left=decision list (35%), right=decision detail (65%)
 *   Bottom:     EpisodeTimeline scrubber
 */
import React, { useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDecisionStore } from '../store/decisionStore'
import type { Decision } from '../types'
import { DecisionDetailModal } from '../components/DecisionDetailModal'
import { EpisodeTimeline } from '../components/EpisodeTimeline'

const PHASE_COLORS: Record<number, string> = {
  0: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  1: 'bg-amber-500/20  text-amber-400  border-amber-500/30',
  2: 'bg-teal-500/20   text-teal-400   border-teal-500/30',
  3: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  4: 'bg-red-500/20    text-red-400    border-red-500/30',
}

export default function DecisionReplay() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate      = useNavigate()
  const store         = useDecisionStore()

  const {
    episodes, currentEpisode, currentDecision, episodeCache,
    selectedDecision, fetchEpisodes, fetchEpisodeData,
    setCurrentEpisode, setCurrentDecision,
  } = store

  // Load episode list on mount
  useEffect(() => {
    if (sessionId) fetchEpisodes(sessionId)
  }, [sessionId, fetchEpisodes])

  // Load episode data when currentEpisode changes
  useEffect(() => {
    if (sessionId && currentEpisode) fetchEpisodeData(sessionId, currentEpisode)
  }, [sessionId, currentEpisode, fetchEpisodeData])

  const decisions: Decision[] = episodeCache[currentEpisode] ?? []
  const bestReward  = episodes.length ? Math.max(...episodes.map((e) => e.total_reward)) : 0
  const convergedEp = episodes.find((e) => e.total_reward === bestReward)?.ep

  const handleSelectEpisode  = useCallback((ep: number) => setCurrentEpisode(ep), [setCurrentEpisode])
  const handleSelectDecision = (idx: number) => setCurrentDecision(idx)
  const handlePrevDecision   = () => { if (currentDecision > 0) setCurrentDecision(currentDecision - 1) }
  const handleNextDecision   = () => { if (currentDecision < decisions.length - 1) setCurrentDecision(currentDecision + 1) }

  return (
    <div className="min-h-screen bg-[#060a10] text-slate-100 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-3 bg-[#0b0f17] border-b border-white/[0.06] flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-slate-500 hover:text-slate-200 text-sm font-mono transition-colors"
        >← Back</button>
        <div className="h-4 w-px bg-white/10" />
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Decision Replay</span>
        <span className="text-xs text-slate-400 font-mono truncate max-w-48">{sessionId}</span>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[10px] text-slate-500 font-mono">{episodes.length} episodes</span>
          {bestReward !== 0 && (
            <span className="text-[10px] font-mono text-slate-500">
              Best: <span className={bestReward >= 0 ? 'text-emerald-400' : 'text-red-400'}>{bestReward.toFixed(1)}</span>
            </span>
          )}
          {convergedEp && (
            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5 font-mono">
              ✓ Converged ep {convergedEp}
            </span>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Decision list */}
        <div className="w-[35%] flex flex-col border-r border-white/[0.06] overflow-hidden">
          <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
              Episode {currentEpisode} · {decisions.length} decisions
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevDecision}
                disabled={currentDecision <= 0}
                className="text-[10px] text-slate-500 hover:text-slate-200 disabled:opacity-30 font-mono transition-colors"
              >←</button>
              <span className="text-[9px] font-mono text-slate-600">{currentDecision + 1}/{decisions.length}</span>
              <button
                onClick={handleNextDecision}
                disabled={currentDecision >= decisions.length - 1}
                className="text-[10px] text-slate-500 hover:text-slate-200 disabled:opacity-30 font-mono transition-colors"
              >→</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
            {decisions.length === 0 ? (
              <div className="flex items-center justify-center h-24">
                <span className="text-[10px] text-slate-600 font-mono">Loading…</span>
              </div>
            ) : (
              decisions.map((d, idx) => {
                const phaseColor = PHASE_COLORS[d.action.phase] ?? PHASE_COLORS[4]
                const isSelected = idx === currentDecision
                return (
                  <button
                    key={`${d.episode}-${d.step}`}
                    onClick={() => handleSelectDecision(idx)}
                    className={`w-full text-left rounded-xl px-3 py-2 flex items-center gap-3 transition-all border
                      ${isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-500/30'
                        : 'bg-[#0f1520] border-white/[0.04] hover:border-white/10'
                      }`}
                  >
                    <span className="text-[9px] text-slate-600 font-mono w-4 flex-shrink-0">#{d.step}</span>
                    <span className={`text-[8px] border rounded-full px-1.5 py-0.5 font-mono font-bold flex-shrink-0 ${phaseColor}`}>
                      {d.action.phase_name}
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">{d.action.duration_s}s</span>
                    <span className={`ml-auto text-[9px] font-mono font-bold ${d.reward_total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {d.reward_total >= 0 ? '+' : ''}{d.reward_total.toFixed(2)}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Right: Decision detail (inline, no modal) */}
        <div className="flex-1 overflow-auto p-4">
          {selectedDecision ? (
            <DecisionDetailModal
              decision={selectedDecision}
              totalDecisions={decisions.length}
              onPrev={currentDecision > 0 ? handlePrevDecision : undefined}
              onNext={currentDecision < decisions.length - 1 ? handleNextDecision : undefined}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-[11px] text-slate-600 font-mono">Select a decision to inspect</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Episode timeline */}
      <div className="flex-shrink-0 bg-[#0b0f17] border-t border-white/[0.06] px-4 py-3">
        <EpisodeTimeline
          episodes={episodes}
          currentEp={currentEpisode}
          onSelect={handleSelectEpisode}
          convergenceEp={convergedEp}
        />
      </div>
    </div>
  )
}
