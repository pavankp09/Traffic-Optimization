/**
 * ActionProbHeatmap — compact 5×7 action probability grid.
 *
 * Design:
 * - Matte, desaturated teal palette — dark background, subtle heat
 * - Small cells (22px), no borders, flat colors
 * - highlightChosen (default false): off in live view, on in Full Intel
 *   When on: chosen cell gets a slim white outline only — no fill change, no glow
 */
import React from 'react'

const PHASE_NAMES = ['N+S', 'E+W', 'N+E', 'S+W', 'All-Red']
const DURATIONS   = [15, 20, 25, 30, 40, 50, 60]
const N_DURATIONS = 7

interface ActionProbHeatmapProps {
  probs:            number[]
  chosenAction:     number
  highlightChosen?: boolean   // true only in Full Intel, false in live view
}

export function ActionProbHeatmap({ probs, chosenAction, highlightChosen = false }: ActionProbHeatmapProps) {
  const maxProb  = Math.max(...probs, 1e-8)
  const totalSum = probs.reduce((a, b) => a + b, 0) || 1

  // Matte teal palette — low sat, dark
  // t=0 → rgb(17,28,30)  t=1 → rgb(30,100,112)
  const cellBg = (t: number) => {
    const r = Math.round(17 + t * 13)
    const g = Math.round(28 + t * 72)
    const b = Math.round(30 + t * 82)
    return `rgb(${r},${g},${b})`
  }

  return (
    <div className="w-full select-none">
      {/* Column headers */}
      <div className="grid mb-1" style={{ gridTemplateColumns: '38px repeat(7, 1fr)' }}>
        <div />
        {DURATIONS.map(d => (
          <div key={d} className="text-center text-[8px] text-gray-600 font-mono">{d}s</div>
        ))}
      </div>

      {/* Rows */}
      {PHASE_NAMES.map((name, pi) => (
        <div key={pi} className="grid mb-[2px]" style={{ gridTemplateColumns: '38px repeat(7, 1fr)' }}>
          <div className="flex items-center justify-end pr-1.5">
            <span className="text-[9px] text-gray-500 font-mono">{name}</span>
          </div>
          {DURATIONS.map((_, di) => {
            const idx      = pi * N_DURATIONS + di
            const prob     = probs[idx] ?? 0
            const isChosen = idx === chosenAction
            const t        = prob / maxProb
            const pct      = Math.round(prob / totalSum * 100)

            // Text color: brighter on dark cells, dimmer on bright
            const textAlpha = t > 0.55 ? 0.9 : t > 0.2 ? 0.65 : 0.4

            return (
              <div key={di}
                title={`${name} ${DURATIONS[di]}s — ${pct}%${isChosen ? ' · chosen' : ''}`}
                className="mx-[1.5px] rounded-sm flex items-center justify-center"
                style={{
                  height: 22,
                  backgroundColor: cellBg(t),
                  // Only show outline in Full Intel mode, and only on the chosen cell
                  outline: highlightChosen && isChosen ? '1.5px solid rgba(255,255,255,0.5)' : 'none',
                  outlineOffset: '-1px',
                }}
              >
                <span style={{
                  fontSize: 9,
                  fontFamily: 'monospace',
                  fontWeight: t > 0.6 ? 600 : 400,
                  color: `rgba(203,213,225,${textAlpha})`,
                }}>
                  {pct}%
                </span>
              </div>
            )
          })}
        </div>
      ))}

      {/* Compact legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
        {highlightChosen && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: cellBg(0.7), outline: '1.5px solid rgba(255,255,255,0.5)', outlineOffset: '-1px' }} />
            <span className="text-[8px] text-gray-600 font-mono">Sampled action (stochastic — may differ from highest)</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          {[0.05, 0.3, 0.6, 1.0].map(t => (
            <div key={t} className="w-3 h-3 rounded-sm" style={{ backgroundColor: cellBg(t) }} />
          ))}
          <span className="text-[8px] text-gray-600 font-mono ml-1">Low → High</span>
        </div>
      </div>
    </div>
  )
}
