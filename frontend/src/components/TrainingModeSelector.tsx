/**
 * TrainingModeSelector — 4-card picker shown in NRAL panel before training.
 */
import React from 'react'

export type TrainingMode = 'stage1' | 'stage2' | 'stage3' | 'stage4'

interface ModeCard {
  id:    TrainingMode
  label: string
  sub:   string
  time:  string
  desc:  string
  color: string
  warn?: boolean
}

const MODES: ModeCard[] = [
  {
    id: 'stage1', label: 'Stage 1', sub: 'Fast Mock', time: '~8 min',
    desc: 'Queue arithmetic. Good for quick experiments and baseline tuning.',
    color: '#60a5fa',
  },
  {
    id: 'stage2', label: 'Stage 2', sub: 'Enriched', time: '~20 min',
    desc: 'Adds startup delay (2s), vehicle-mix capacity reduction, pedestrian crossing time, and spillback penalty.',
    color: '#34d399',
  },
  {
    id: 'stage3', label: 'Stage 3', sub: 'SUMO Physics', time: '4–8 hrs',
    desc: 'Full vehicle simulation — real acceleration, lane changes, pedestrians. Requires SUMO installed.',
    color: '#f59e0b',
    warn: true,
  },
  {
    id: 'stage4', label: 'Stage 4', sub: 'Curriculum', time: '~45 min',
    desc: 'Auto-progression: Stage 2 (60%) → Stage 3 (40%). Stage 2 learns demand; Stage 3 refines with physics.',
    color: '#a78bfa',
  },
]

interface Props {
  selected: TrainingMode
  onChange: (m: TrainingMode) => void
}

export function TrainingModeSelector({ selected, onChange }: Props) {
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] text-gray-600 font-mono uppercase tracking-widest px-0.5">Training Mode</p>
      <div className="grid grid-cols-2 gap-1">
        {MODES.map(m => {
          const active = selected === m.id
          return (
            <button key={m.id} onClick={() => onChange(m.id)}
              className="text-left rounded-lg p-2 transition-all"
              style={{
                background: active ? `${m.color}12` : 'rgba(255,255,255,0.02)',
                border: `1px solid ${active ? m.color + '50' : 'rgba(255,255,255,0.06)'}`,
                boxShadow: active ? `0 0 0 1px ${m.color}25` : 'none',
              }}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold" style={{ color: active ? m.color : '#94a3b8' }}>
                    {m.label}
                  </span>
                  <span className="text-[8px] font-mono px-1 py-0.5 rounded"
                    style={{ background: `${m.color}15`, color: m.color }}>
                    {m.sub}
                  </span>
                </div>
                <span className="text-[7px] font-mono text-gray-600">{m.time}</span>
              </div>
              <p className="text-[8px] text-gray-500 leading-tight line-clamp-2">{m.desc}</p>
              {m.warn && (
                <div className="mt-0.5 flex items-center gap-1">
                  <span className="text-[7px]">⚠️</span>
                  <span className="text-[7px] text-amber-500 font-mono">Requires SUMO</span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
