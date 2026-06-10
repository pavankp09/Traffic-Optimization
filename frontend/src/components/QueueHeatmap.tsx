import React, { useState, useEffect } from 'react'
import HelpPopover from './HelpPopover'
import { useSimulationStore } from '../store/simulationStore'
import { useSessionStore } from '../store/sessionStore'
import { MODEL_METADATA } from '../utils/constants'
import type { ArmMetrics, SimFrame } from '../types'

const ARM_POSITIONS = {
  N: { top: 0, left: '50%', transform: 'translateX(-50%)' },
  S: { bottom: 0, left: '50%', transform: 'translateX(-50%)' },
  E: { right: 0, top: '50%', transform: 'translateY(-50%)' },
  W: { left: 0, top: '50%', transform: 'translateY(-50%)' },
}

function heatColor(value: number, max: number): string {
  const ratio = Math.min(value / Math.max(max, 1), 1)
  const r = Math.round(ratio * 239)
  const g = Math.round((1 - ratio) * 68 + ratio * 68)
  const b = Math.round((1 - ratio) * 68)
  return `rgb(${r}, ${g}, ${b})`
}

export default function QueueHeatmap() {
  const viewMode = useSimulationStore((s) => s.viewMode)
  const selectedModelSingle = useSimulationStore((s) => s.selectedModelSingle)
  const selectedModelsSplit = useSimulationStore((s) => s.selectedModelsSplit)
  const isRunning = useSimulationStore((s) => s.isRunning)
  const simTimeS = useSimulationStore((s) => s.simTimeS)

  // Simulation frame buffers
  const baselineFrame = useSimulationStore((s) => s.baselineFrame)
  const rl1Frame      = useSimulationStore((s) => s.rl1Frame)
  const rl2Frame      = useSimulationStore((s) => s.rl2Frame)
  const rl3Frame      = useSimulationStore((s) => s.rl3Frame)
  const rl4Frame      = useSimulationStore((s) => s.rl4Frame)

  const currentMetrics = useSessionStore((s) => s.currentMetrics)

  // Determine active compare keys
  const activeKeys = viewMode === 'single' 
    ? ['baseline', selectedModelSingle] 
    : selectedModelsSplit

  // Local state to toggle which compared model's queue to inspect
  const [inspectKey, setInspectKey] = useState<string>('rl1')

  // Auto-align inspectKey when selected options change
  useEffect(() => {
    if (!activeKeys.includes(inspectKey)) {
      setInspectKey(activeKeys.find(k => k !== 'baseline') || activeKeys[0] || 'baseline')
    }
  }, [selectedModelSingle, selectedModelsSplit, viewMode])

  const getFrameForModel = (modelKey: string): SimFrame | null => {
    if (modelKey === 'baseline') return baselineFrame
    if (modelKey === 'rl1') return rl1Frame
    if (modelKey === 'rl2') return rl2Frame
    if (modelKey === 'rl3') return rl3Frame
    if (modelKey === 'rl4') return rl4Frame
    return null
  }

  // Calculate live arm queues dynamically from simulation frames
  const getPerArmMetrics = (modelKey: string): Record<string, ArmMetrics> | null => {
    // If simulation has not started, show clean empty state
    if (!isRunning && simTimeS === 0 && !currentMetrics) {
      return null
    }

    // If it's the active training model and has metrics, we can use it
    if (modelKey === selectedModelSingle && currentMetrics?.per_arm) {
      const perArmVal = currentMetrics.per_arm
      if (Object.keys(perArmVal).length > 0) return perArmVal
    }

    const frame = getFrameForModel(modelKey)
    if (frame) {
      const arms = ['N', 'S', 'E', 'W'] as const
      return Object.fromEntries(
        arms.map((arm) => {
          const armVehicles = frame.vehicles.filter((v) => v.arm === arm)
          const stopped = armVehicles.filter((v) => v.speed < 0.5)
          const waitTimes = armVehicles.map((v) => v.wait_time).filter((w) => w > 0)
          const avgWait = waitTimes.length ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0
          
          return [
            arm,
            {
              arm,
              queue_len: stopped.length,
              avg_wait_s: avgWait,
              flow_rate_vph: armVehicles.length * 15,
              heavy_vehicle_ratio: 0.1,
              green_time_used_s: 25,
              green_time_total_s: 30,
            },
          ]
        })
      )
    }

    return null
  }

  const perArm = getPerArmMetrics(inspectKey)

  if (!perArm) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-xs text-center gap-2">
        <span className="text-3xl">🛺</span>
        <span>Start simulation to view<br />live approach queue heatmap</span>
      </div>
    )
  }

  const arms = Object.values(perArm)
  const maxQueue = Math.max(...arms.map((a) => a.queue_len), 1)

  return (
    <div className="space-y-3">
      {/* Header with Selector Pills */}
      <div className="flex items-center justify-between border-b border-gray-900 pb-1.5 flex-wrap gap-1">
        <h3 className="text-xs text-gray-400 font-extrabold font-mono uppercase tracking-wider flex items-center gap-1">
          Approach Heatmap
          <HelpPopover text="### Approach Heatmap\nA real-time spatial backlog density visualizer:\n- **Density Color-mapping**: Interpolates from glowing green (clear flow) to amber (moderate load) to glowing red (dense queue backlogs).\n- **Physical Axis Map**: Monitors North (N), South (S), East (E), and West (W) arms. Hover over individual arm boxes to inspect live queue counts and average delay seconds." position="top" />
        </h3>
        
        {/* Model Toggle Selector */}
        <div className="flex bg-gray-950 p-0.5 rounded border border-gray-800 gap-0.5">
          {activeKeys.map((key) => {
            const isSelected = inspectKey === key
            const meta = MODEL_METADATA[key] ?? { label: key, color: '#fff' }
            return (
              <button
                key={key}
                type="button"
                className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold font-mono transition-all ${
                  isSelected 
                    ? 'bg-gray-800 text-white font-extrabold' 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                style={{ color: isSelected ? meta.color : undefined }}
                onClick={() => setInspectKey(key)}
              >
                {meta.label.split(' ')[0]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="relative w-full aspect-square max-w-[190px] mx-auto bg-gray-950/60 rounded-xl border border-gray-900 p-2">
        {/* Center intersection */}
        <div className="absolute inset-[36%] bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center shadow-inner">
          <span className="text-gray-400 text-xs font-mono font-bold">∩</span>
        </div>

        {/* Arm indicators */}
        {Object.entries(perArm).map(([arm, metrics]) => {
          const color = heatColor(metrics.queue_len, maxQueue)
          const pos = ARM_POSITIONS[arm as keyof typeof ARM_POSITIONS]
          if (!pos) return null
          return (
            <div
              key={arm}
              className="absolute w-12 h-10 rounded-lg flex flex-col items-center justify-center text-[10px] font-mono shadow transition-all duration-300"
              style={{ ...pos, backgroundColor: color + '25', borderColor: color, border: `1.5px solid ${color}` }}
              title={`${arm}: queue=${metrics.queue_len.toFixed(0)}, wait=${metrics.avg_wait_s.toFixed(1)}s`}
            >
              <span className="font-extrabold" style={{ color }}>{arm}</span>
              <span className="text-gray-100 font-bold">{metrics.queue_len.toFixed(0)}</span>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex justify-between text-[9px] text-gray-500 px-1 font-mono uppercase font-bold">
        <span className="text-emerald-400">Clear Flow</span>
        <span>Backlog</span>
        <span className="text-red-400">Queued</span>
      </div>
    </div>
  )
}
