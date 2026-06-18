import { useState } from 'react'
import { useSimulationStore } from '../store/simulationStore'
import { useConfigStore } from '../store/configStore'
import SimCanvas from './SimCanvas'
import SimLiveStatsPanel from './SimLiveStatsPanel'
import { MODEL_METADATA } from '../utils/constants'

export { MODEL_METADATA }

export default function SplitCanvas() {
  const selectedModels = useSimulationStore((s) => s.selectedModelsSplit)
  const simTimeS = useSimulationStore((s) => s.splitSimTimeS)
  const splitFrames = useSimulationStore((s) => s.splitFrames)

  const { simConfig } = useConfigStore()
  const maxDur = Number(simConfig.simulation_duration_s ?? 1800)
  const pct = maxDur > 0 ? Math.min(1, simTimeS / maxDur) : 0

  const [expandedModel, setExpandedModel] = useState<string | null>(null)

  const fmtClock = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const getFrameForModel = (modelName: string) => {
    return splitFrames[modelName] || null
  }

  const count = selectedModels.length

  // Proportional canvases — maintain the standard 720:560 (1.2857) aspect ratio from the single view
  // 2-up: 680x528 each. 3-up/4-up: 520x404 each.
  const size = count >= 3
    ? { w: 520, h: 404 }
    : { w: 680, h: 528 }

  let gridColsClass = 'grid-cols-2'
  if (count === 3) gridColsClass = 'grid-cols-1 md:grid-cols-3'
  else if (count === 4) gridColsClass = 'grid-cols-2'

  return (
    <div className="flex flex-col gap-3 w-full">

      {/* Canvas grid — min-w-0 on each cell prevents grid blowout */}
      <div className={`grid ${gridColsClass} gap-3 w-full`} style={{ gridAutoRows: 'auto' }}>
        {selectedModels.map((modelKey) => {
          const frame = getFrameForModel(modelKey)
          const meta = MODEL_METADATA[modelKey] ?? { label: modelKey, desc: '', color: '#fff', indicatorColor: 'bg-gray-400' }
          return (
            <div key={modelKey} className="flex flex-col bg-[#0b0f17] rounded-xl border border-white/[0.06] min-w-0 overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05] bg-black/20 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.indicatorColor}`} />
                  <span className="text-[11px] font-semibold font-mono tracking-wide" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                </div>

                {/* Description + Expand action */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[9px] font-mono text-slate-600 truncate max-w-[120px] sm:max-w-none">{meta.desc}</span>
                  <button
                    onClick={() => setExpandedModel(modelKey)}
                    type="button"
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all flex-shrink-0"
                    title={`Expand ${meta.label}`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Centered Canvas Container */}
              <div className="flex-1 flex items-center justify-center bg-black/20 p-2 rounded-b-xl">
                <SimCanvas
                  width={size.w}
                  height={size.h}
                  frameOverride={frame}
                  label={meta.label}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Expanded view Modal */}
      {expandedModel && (() => {
        const frame = getFrameForModel(expandedModel)
        const meta = MODEL_METADATA[expandedModel] ?? { label: expandedModel, desc: '', color: '#fff', indicatorColor: 'bg-gray-400' }
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
            {/* Modal Box */}
            <div className="relative flex flex-col bg-[#0b0f17] border border-white/[0.08] rounded-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden shadow-2xl">

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-black/30 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${meta.indicatorColor}`} />
                  <span className="text-sm font-bold font-mono uppercase tracking-wide" style={{ color: meta.color }}>
                    {meta.label} - Expanded View
                  </span>
                  <span className="text-xs text-slate-500 font-mono hidden md:inline">({meta.desc})</span>
                </div>
                <button
                  onClick={() => setExpandedModel(null)}
                  type="button"
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all"
                  title="Close Expanded View"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {/* Content body - side-by-side on desktop, scrollable stacked on mobile */}
              <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 overflow-y-auto items-center lg:items-stretch justify-center">

                {/* Left side: Large Canvas container */}
                <div className="flex items-center justify-center bg-black/25 rounded-2xl border border-white/[0.04] p-2 flex-shrink-0 max-w-full">
                  <SimCanvas
                    width={720}
                    height={560}
                    frameOverride={frame}
                    label={meta.label}
                    responsive={true}
                    className="max-w-full"
                  />
                </div>

                {/* Right side: Telemetry Panel */}
                <div className="flex-1 max-w-[560px] w-full flex items-center justify-center">
                  <SimLiveStatsPanel modelKey={expandedModel} />
                </div>

              </div>

            </div>
          </div>
        )
      })()}

    </div>
  )
}
