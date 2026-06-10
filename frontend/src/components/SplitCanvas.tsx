import { useSimulationStore } from '../store/simulationStore'
import { useConfigStore } from '../store/configStore'
import SimCanvas from './SimCanvas'
import { MODEL_METADATA } from '../utils/constants'

export { MODEL_METADATA }

export default function SplitCanvas() {
  const selectedModels = useSimulationStore((s) => s.selectedModelsSplit)
  const simTimeS       = useSimulationStore((s) => s.simTimeS)

  const baselineFrame = useSimulationStore((s) => s.baselineFrame)
  const rl1Frame      = useSimulationStore((s) => s.rl1Frame)
  const rl2Frame      = useSimulationStore((s) => s.rl2Frame)
  const rl3Frame      = useSimulationStore((s) => s.rl3Frame)
  const rl4Frame      = useSimulationStore((s) => s.rl4Frame)

  const { simConfig } = useConfigStore()
  const maxDur = Number(simConfig.simulation_duration_s ?? 1800)
  const pct    = maxDur > 0 ? Math.min(1, simTimeS / maxDur) : 0

  const fmtClock = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const getFrameForModel = (modelName: string) => {
    if (modelName === 'baseline') return baselineFrame
    if (modelName === 'rl1') return rl1Frame
    if (modelName === 'rl2') return rl2Frame
    if (modelName === 'rl3') return rl3Frame
    if (modelName === 'rl4') return rl4Frame
    return null
  }

  const count = selectedModels.length

  // Square canvases — equal width & height so the intersection looks balanced.
  // 2-up: 560×560 each. 3-up: 420×420 each.
  const size = count >= 3
    ? { w: 420, h: 420 }
    : { w: 560, h: 560 }

  let gridColsClass = 'grid-cols-2'
  if (count === 3) gridColsClass = 'grid-cols-1 md:grid-cols-3'
  else if (count === 4) gridColsClass = 'grid-cols-2'

  return (
    <div className="flex flex-col gap-3 w-full">

      {/* Shared simulation progress bar — spans full width above all canvases */}
      <div className="flex items-center gap-3 bg-black/20 border border-white/[0.05] rounded-xl px-4 py-2.5">
        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-600 flex-shrink-0">
          Progress
        </span>
        <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct * 100}%`, background: 'linear-gradient(90deg, #3b82f6, #7ec8e3)' }}
          />
        </div>
        <span className="text-[10px] font-mono tabular-nums font-bold text-[#7ec8e3] flex-shrink-0">
          {fmtClock(simTimeS)}
        </span>
        <span className="text-[9px] font-mono text-slate-600 flex-shrink-0">
          / {fmtClock(maxDur)}
        </span>
        <span className="text-[9px] font-mono tabular-nums text-slate-500 flex-shrink-0 w-9 text-right">
          {(pct * 100).toFixed(1)}%
        </span>
      </div>

      {/* Canvas grid — min-w-0 on each cell prevents grid blowout */}
      <div className={`grid ${gridColsClass} gap-3 w-full`} style={{ gridAutoRows: 'auto' }}>
        {selectedModels.map((modelKey) => {
          const frame = getFrameForModel(modelKey)
          const meta  = MODEL_METADATA[modelKey] ?? { label: modelKey, desc: '', color: '#fff', indicatorColor: 'bg-gray-400' }
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
                <span className="text-[9px] font-mono text-slate-600 truncate ml-2">{meta.desc}</span>
              </div>

              <SimCanvas
                width={size.w}
                height={size.h}
                frameOverride={frame}
                label={meta.label}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
