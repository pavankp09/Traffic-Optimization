/**
 * DecisionDetailModal — full XAI breakdown for one RL decision.
 * Modal mode (onClose provided): dark overlay, glassmorphism panel.
 * Inline mode (no onClose): fills container — used in DecisionReplay.
 *
 * Three panels:
 *   Left   : 26-dim observation with labelled bars
 *   Centre : 5×7 action probability heatmap
 *   Right  : Feature importance + reward breakdown + value
 */
import React from 'react'
import type { Decision } from '../types'
import { ActionProbHeatmap } from './ActionProbHeatmap'
import { FeatureImportanceBars } from './FeatureImportanceBars'

const PHASE_BADGE: Record<number, string> = {
  0: 'bg-emerald-500 text-white',
  1: 'bg-amber-400 text-black',
  2: 'bg-teal-400 text-black',
  3: 'bg-orange-400 text-black',
  4: 'bg-red-600 text-white',
}

interface DecisionDetailModalProps {
  decision:        Decision
  totalDecisions?: number
  onPrev?:         () => void
  onNext?:         () => void
  onClose?:        () => void   // undefined → inline mode
}

export function DecisionDetailModal({
  decision,
  totalDecisions,
  onPrev,
  onNext,
  onClose,
}: DecisionDetailModalProps) {
  const isModal    = !!onClose
  const badgeClass = PHASE_BADGE[decision.action.phase] ?? PHASE_BADGE[4]
  const obsLabels  = decision.obs.map((o) => o.label)
  const isPositive = decision.reward_total >= 0

  const panel = (
    <div
      className="bg-gray-950 border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden w-full"
      style={{ maxHeight: isModal ? '90vh' : undefined }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-5 py-3 bg-gray-900 border-b border-gray-700 flex-shrink-0">
        <span className="text-gray-500 text-xs font-mono">Step</span>
        <span className="text-white text-lg font-bold font-mono">#{decision.step}</span>
        <span className="text-gray-600 text-sm">·</span>
        <span className="text-gray-400 text-xs font-mono">Episode {decision.episode}</span>

        <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${badgeClass}`}>
          {decision.action.phase_name}
        </span>
        <span className="text-gray-400 text-xs font-mono">{decision.action.duration_s}s</span>

        <div className="ml-auto flex items-center gap-3">
          <span className={`text-base font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            R: {isPositive ? '+' : ''}{decision.reward_total.toFixed(3)}
          </span>
          <span className="text-gray-500 text-xs font-mono">V(s): {decision.value.toFixed(2)}</span>
          {isModal && (
            <button
              onClick={onClose}
              className="ml-2 w-7 h-7 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Three panels ── */}
      <div className="flex flex-1 overflow-hidden divide-x divide-gray-800 min-h-0">

        {/* LEFT: Observation (26-dim) */}
        <div className="w-[30%] flex flex-col overflow-hidden">
          <div className="px-4 pt-3 pb-2 flex-shrink-0">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest">
              Observation <span className="text-gray-600 font-normal normal-case">(26 inputs)</span>
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-1.5">
            {decision.obs.map((feat) => {
              const pct = Math.min(100, Math.abs(feat.normalised) * 100)
              return (
                <div key={feat.label}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-gray-400 truncate flex-1 mr-2" title={feat.label}>
                      {feat.label}
                    </span>
                    <span className="text-[11px] font-mono text-gray-300 flex-shrink-0">
                      {feat.value.toFixed(3)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* CENTRE: Action probability heatmap */}
        <div className="w-[40%] flex flex-col overflow-hidden">
          <div className="px-4 pt-3 pb-2 flex-shrink-0">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest">
              Action Probabilities
              <span className="text-gray-600 font-normal normal-case ml-1">(5 phases × 7 durations)</span>
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-3">
            <ActionProbHeatmap probs={decision.probs} chosenAction={decision.action.action_idx} />
          </div>
        </div>

        {/* RIGHT: Feature importance + reward breakdown */}
        <div className="w-[30%] flex flex-col overflow-hidden">
          <div className="px-4 pt-3 pb-2 flex-shrink-0">
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-widest">Why this decision</h3>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-4">

            {/* Feature importance */}
            <div>
              <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-2">Top influences</p>
              <FeatureImportanceBars importance={decision.importance} obsLabels={obsLabels} topN={8} />
            </div>

            {/* Reward breakdown */}
            <div>
              <p className="text-[10px] text-gray-500 font-mono uppercase tracking-wider mb-2">Reward components</p>
              <div className="space-y-1.5">
                {Object.entries(decision.reward_parts).map(([key, val]) => {
                  const v = val as number
                  const isPos = v >= 0
                  const pct = Math.min(100, Math.abs(v) * 35)
                  return (
                    <div key={key} className="grid gap-x-2 gap-y-0.5"
                      style={{ gridTemplateColumns: '76px 1fr 52px' }}>
                      <span className="text-[10px] text-gray-400 font-mono truncate self-center">{key}</span>
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden self-center">
                        <div
                          className={`h-full rounded-full ${isPos ? 'bg-emerald-500' : 'bg-red-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-[11px] font-bold font-mono tabular-nums text-right self-center ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isPos ? '+' : ''}{v.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>
              {/* Total */}
              <div className="mt-3 pt-2 border-t border-gray-700 flex items-center justify-between">
                <span className="text-xs text-gray-300 font-semibold">TOTAL REWARD</span>
                <span className={`text-sm font-bold font-mono ${isPositive ? 'text-emerald-300' : 'text-red-300'}`}>
                  {isPositive ? '+' : ''}{decision.reward_total.toFixed(3)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer nav ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-gray-900 border-t border-gray-700 flex-shrink-0">
        <button
          onClick={onPrev}
          disabled={!onPrev || decision.step <= 1}
          className="flex items-center gap-1.5 text-sm font-mono text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ← Prev
        </button>
        <span className="text-xs text-gray-500 font-mono">
          Step {decision.step} of {totalDecisions ?? '?'}
        </span>
        <button
          onClick={onNext}
          disabled={!onNext || (totalDecisions !== undefined && decision.step >= totalDecisions)}
          className="flex items-center gap-1.5 text-sm font-mono text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next →
        </button>
      </div>
    </div>
  )

  if (!isModal) return panel

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
        {panel}
      </div>
    </div>
  )
}
