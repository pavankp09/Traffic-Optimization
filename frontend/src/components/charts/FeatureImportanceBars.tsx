/**
 * FeatureImportanceBars — shows top-N observation features by gradient importance.
 * Used in DecisionDetailModal and DecisionReplay detail panel.
 */
import React from 'react'

interface FeatureImportanceBarsProps {
  importance: number[]    // length 26, normalised 0..1
  obsLabels:  string[]    // length 26
  topN?:      number      // default 8
}

const OBS_LABELS_DEFAULT = [
  'N Queue (veh)', 'N Wait (s)', 'N Arrival Rate', 'N Just Served',
  'S Queue (veh)', 'S Wait (s)', 'S Arrival Rate', 'S Just Served',
  'E Queue (veh)', 'E Wait (s)', 'E Arrival Rate', 'E Just Served',
  'W Queue (veh)', 'W Wait (s)', 'W Arrival Rate', 'W Just Served',
  'N Queue Δ', 'S Queue Δ', 'E Queue Δ', 'W Queue Δ',
  'Phase 0 (N+S)', 'Phase 1 (E+W)', 'Phase 2 (N+E)',
  'Phase 3 (S+W)', 'Phase 4 (All-Red)', 'Episode Progress',
]

export function FeatureImportanceBars({
  importance,
  obsLabels = OBS_LABELS_DEFAULT,
  topN = 8,
}: FeatureImportanceBarsProps) {
  const indexed = importance.map((v, i) => ({ label: obsLabels[i] ?? `obs[${i}]`, value: v, i }))
  const sorted  = [...indexed].sort((a, b) => b.value - a.value).slice(0, topN)

  return (
    <div className="space-y-1.5">
      {sorted.map(({ label, value }, rank) => (
        <div key={label} className="flex items-center gap-2">
          <span className="text-[9px] text-slate-400 w-28 truncate flex-shrink-0" title={label}>{label}</span>
          <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${rank < 3 ? 'bg-amber-400' : 'bg-blue-400'}`}
              style={{ width: `${Math.round(value * 100)}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-slate-500 w-8 text-right flex-shrink-0">
            {Math.round(value * 100)}%
          </span>
        </div>
      ))}
    </div>
  )
}
