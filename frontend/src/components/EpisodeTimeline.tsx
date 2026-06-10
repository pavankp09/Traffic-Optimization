/**
 * EpisodeTimeline — horizontal SVG scrubber for episode replay.
 * Shows reward sparkline, draggable playhead, convergence marker.
 */
import React, { useRef, useCallback } from 'react'
import type { EpisodeSummary } from '../types'

interface EpisodeTimelineProps {
  episodes:      EpisodeSummary[]
  currentEp:     number
  onSelect:      (ep: number) => void
  convergenceEp?: number
}

const HEIGHT      = 80
const SPARKLINE_H = 40

export function EpisodeTimeline({ episodes, currentEp, onSelect, convergenceEp }: EpisodeTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const n = episodes.length
  if (n === 0) return (
    <div className="h-20 flex items-center justify-center">
      <span className="text-[10px] text-slate-600 font-mono">No episodes yet</span>
    </div>
  )

  const rewards = episodes.map((e) => e.total_reward)
  const minR    = Math.min(...rewards)
  const maxR    = Math.max(...rewards)
  const rangeR  = maxR - minR || 1

  const xOf = (i: number, width: number) => (i / Math.max(n - 1, 1)) * width
  const yOf = (r: number) => SPARKLINE_H - ((r - minR) / rangeR) * (SPARKLINE_H - 8) - 4

  const getEpFromX = useCallback((clientX: number): number => {
    if (!svgRef.current) return 0
    const rect  = svgRef.current.getBoundingClientRect()
    const relX  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const epIdx = Math.round(relX * (n - 1))
    return episodes[epIdx]?.ep ?? episodes[0]?.ep ?? 1
  }, [episodes, n])

  const handleClick = (e: React.MouseEvent) => onSelect(getEpFromX(e.clientX))
  const handleDrag  = (e: React.MouseEvent) => { if (e.buttons !== 1) return; onSelect(getEpFromX(e.clientX)) }

  const currentIdx = episodes.findIndex((ep) => ep.ep === currentEp)

  return (
    <div className="w-full select-none">
      <svg
        ref={svgRef}
        width="100%"
        height={HEIGHT}
        className="cursor-pointer"
        onClick={handleClick}
        onMouseMove={handleDrag}
      >
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#10b981" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <svg viewBox={`0 0 1000 ${HEIGHT}`} preserveAspectRatio="none" width="100%" height={HEIGHT}>


          {/* Sparkline stroke */}
          <polyline
            points={rewards.map((r, i) => `${xOf(i, 1000)},${yOf(r)}`).join(' ')}
            fill="none"
            stroke="#10b981"
            strokeWidth="1.5"
          />

          {/* Episode ticks */}
          {episodes.map((ep, i) => (
            <line
              key={ep.ep}
              x1={xOf(i, 1000)} y1={SPARKLINE_H}
              x2={xOf(i, 1000)} y2={SPARKLINE_H + 6}
              stroke={ep.ep === currentEp ? '#22d3ee' : '#334155'}
              strokeWidth={ep.ep === currentEp ? 2 : 1}
            />
          ))}

          {/* Convergence marker */}
          {convergenceEp !== undefined && (() => {
            const ci = episodes.findIndex((e) => e.ep === convergenceEp)
            if (ci < 0) return null
            return (
              <line
                x1={xOf(ci, 1000)} y1={0}
                x2={xOf(ci, 1000)} y2={SPARKLINE_H}
                stroke="#f59e0b" strokeWidth="1" strokeDasharray="3,3"
              />
            )
          })()}

          {/* Playhead */}
          {currentIdx >= 0 && (
            <>
              <line
                x1={xOf(currentIdx, 1000)} y1={0}
                x2={xOf(currentIdx, 1000)} y2={HEIGHT}
                stroke="#22d3ee" strokeWidth="1.5"
              />
              <circle
                cx={xOf(currentIdx, 1000)}
                cy={yOf(rewards[currentIdx])}
                r="4"
                fill="#22d3ee"
                stroke="#0b0f17"
                strokeWidth="1.5"
              />
            </>
          )}
        </svg>
      </svg>

      {/* Labels row */}
      <div className="flex items-center justify-between px-1 mt-1">
        <button
          onClick={() => { const prev = episodes.find((e) => e.ep < currentEp); if (prev) onSelect(prev.ep) }}
          className="text-[10px] text-slate-500 hover:text-slate-200 font-mono transition-colors"
        >◄</button>
        <span className="text-[10px] font-mono text-slate-400">
          Episode {currentEp} / {episodes[n - 1]?.ep ?? n}
          {episodes[currentIdx] && (
            <span className={`ml-2 ${episodes[currentIdx].total_reward >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              R: {episodes[currentIdx].total_reward.toFixed(1)}
            </span>
          )}
        </span>
        <button
          onClick={() => { const next = [...episodes].reverse().find((e) => e.ep > currentEp); if (next) onSelect(next.ep) }}
          className="text-[10px] text-slate-500 hover:text-slate-200 font-mono transition-colors"
        >►</button>
      </div>
    </div>
  )
}
