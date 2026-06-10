import React from 'react'
import HelpPopover from './HelpPopover'
import { useSimulationStore } from '../store/simulationStore'
import { useSessionStore } from '../store/sessionStore'
import { MODEL_METADATA } from '../utils/constants'
import type { EpisodeMetrics } from '../types'

const METRIC_HELP: Record<string, string> = {
  avg_wait_s: "### Average Wait Delay\nThe average time in seconds that vehicles spend completely stopped at the intersection waiting for a green signal.\n- **Goal**: Minimize this value to reduce overall commuter travel time and peak delays.\n- **Formula**:\n$$\\text{Avg Wait} = \\frac{\\sum_{i=1}^{N} d_i}{N}$$\nWhere $d_i$ is the individual stopped delay for vehicle $i$ and $N$ is the total count of vehicles.",
  throughput_vph: "### Flow Throughput\nThe volume of vehicles successfully cleared through the intersection per hour (vehicles per hour).\n- **Goal**: Maximize this value to increase intersection volume capacity and prevent street congestion gridlocks.\n- **Formula**:\n$$\\text{Throughput} = \\frac{3600 \\cdot N_{\\text{cleared}}}{T_{\\text{elapsed}}}$$\nWhere $N_{\\text{cleared}}$ is the count of vehicles cleared and $T_{\\text{elapsed}}$ is simulated seconds.",
  green_utilisation: "### Green Light Utilisation\nThe percentage of green light duration where active queue discharge occurs (i.e., green time is actively utilized by moving vehicles).\n- **Goal**: Maximize this to avoid wasting green time on empty approach lanes.\n- **Formula**:\n$$\\text{Green Util} = \\frac{\\sum T_{\\text{discharge}}}{T_{\\text{green\\_total}}} \\times 100\\%$$",
  signal_efficiency: "### Signal Coordination Efficiency\nMeasures the efficiency of signal timing switches based on vehicle arrival distributions.\n- **Goal**: Higher percentage means green times are perfectly aligned with platoons of incoming vehicles to reduce stop-and-go friction.\n- **Formula**:\n$$\\text{Coordination} = \\text{Platoon Sync Rate}$$",
  collision_count: "### Safety Incidents\nTracks conflict and collision risk indexes within the intersection grid.\n- **Goal**: Keep this at absolute $0$. Higher numbers indicate safety threshold violations."
}

interface ComparativeKpiCardProps {
  label: string
  activeKeys: string[]
  metricsMap: Record<string, EpisodeMetrics>
  metricKey: keyof EpisodeMetrics | 'avg_wait_s' | 'throughput_vph' | 'green_utilisation' | 'signal_efficiency' | 'collision_count'
  unit?: string
  lowerIsBetter?: boolean
  formatVal?: (v: number) => string
}

function ComparativeKpiCard({
  label,
  activeKeys,
  metricsMap,
  metricKey,
  unit = '',
  lowerIsBetter = false,
  formatVal = (v: number) => v.toFixed(1),
}: ComparativeKpiCardProps) {

  // Extract values for each active key
  const values = activeKeys.map((key) => {
    const metrics = metricsMap[key]
    let val = 0
    if (metrics) {
      if (metricKey === 'green_utilisation' || metricKey === 'signal_efficiency') {
        // Convert to percentage for rendering
        val = metrics[metricKey] !== undefined ? metrics[metricKey] * 100 : 0
      } else {
        val = (metrics[metricKey] as number) ?? 0
      }
    }
    const meta = MODEL_METADATA[key] ?? { label: key, color: '#fff' }
    return { key, val, label: meta.label, color: meta.color }
  })

  // Find max value to calibrate relative progress bar sizes
  const maxVal = Math.max(...values.map((v) => v.val), 1)

  // Baseline reference value for delta calculations
  const baselineVal = values.find((v) => v.key === 'baseline')?.val

  return (
    <div className="flex-1 min-w-[220px] bg-[#0c1018] border border-white/[0.07] rounded-2xl p-4 flex flex-col gap-3 shadow-[0_4px_24px_rgba(0,0,0,0.4)] hover:border-white/[0.12] hover:shadow-[0_4px_32px_rgba(0,0,0,0.55)] transition-all duration-300 group">

      {/* Card Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-white/[0.05]">
        <span className="text-[10px] font-bold font-mono text-slate-400 tracking-widest uppercase">{label}</span>
        {METRIC_HELP[metricKey] && (
          <HelpPopover text={METRIC_HELP[metricKey]} position="top" />
        )}
      </div>

      {/* Comparative Rows */}
      <div className="flex flex-col gap-2.5">
        {values.map(({ key, val, label: modelLabel, color }) => {
          const pct = Math.max(3, Math.min(100, (val / maxVal) * 100))

          let deltaHtml = null
          if (key !== 'baseline' && baselineVal !== undefined && baselineVal > 0 && val > 0) {
            const diff = lowerIsBetter ? baselineVal - val : val - baselineVal
            const deltaPercent = (diff / baselineVal) * 100
            const isImprovement = deltaPercent > 0
            if (deltaPercent !== 0) {
              deltaHtml = (
                <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded-md ml-1.5 ${
                  isImprovement
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/30'
                    : 'bg-red-950/60 text-red-400 border border-red-900/30'
                }`}>
                  {isImprovement ? '+' : ''}{deltaPercent.toFixed(0)}%
                </span>
              )
            }
          }

          return (
            <div key={key} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold font-sans uppercase tracking-wide truncate max-w-[100px]" style={{ color }}>
                  {modelLabel.split(' ')[0]} {modelLabel.split(' ')[1] || ''}
                </span>
                <div className="flex items-center">
                  <span className="text-[13px] font-bold font-mono leading-none" style={{ color: val > 0 ? '#f1f5f9' : '#475569' }}>
                    {formatVal(val)}
                  </span>
                  {unit && <span className="text-[9px] text-slate-600 font-mono ml-0.5">{unit}</span>}
                  {deltaHtml}
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500 ease-out rounded-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: val > 0 ? color : 'transparent',
                    opacity: val > 0 ? 0.8 : 0,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}

export default function KpiCards() {
  const viewMode = useSimulationStore((s) => s.viewMode)
  const selectedModelSingle = useSimulationStore((s) => s.selectedModelSingle)
  const selectedModelsSplit = useSimulationStore((s) => s.selectedModelsSplit)

  // Live metrics are computed centrally in useSocket and kept here; subscribing
  // to this map re-renders the KPI cards on every incoming simulation frame.
  const lastSimulationMetrics = useSimulationStore((s) => s.lastSimulationMetrics)

  // Training metrics state
  const baselineMetrics = useSessionStore((s) => s.baselineMetrics)
  const isTraining = useSessionStore((s) => s.isTraining)
  const trainingModelKey = useSessionStore((s) => s.trainingModelKey)

  // Determine active keys based on current viewMode
  const activeKeys = viewMode === 'single'
    ? (selectedModelSingle === 'baseline' ? ['baseline'] : ['baseline', selectedModelSingle])
    : selectedModelsSplit

  // Resolve metrics for each active key
  const metricsMap: Record<string, EpisodeMetrics> = {}
  activeKeys.forEach((key) => {
    // While THIS model is training, keep its RL row empty/zero in KPI cards.
    // Other (already-trained) RL models keep showing their real metrics even
    // when a different model is training in the background.
    if (key !== 'baseline' && isTraining && key === trainingModelKey) {
      metricsMap[key] = {
        episode_id: key,
        session_id: 'empty',
        duration_s: 0,
        n_vehicles: 0,
        avg_wait_s: 0,
        per_type: {},
        per_arm: {},
        throughput_vph: 0,
        green_utilisation: 0,
        collision_count: 0,
        violation_count: 0,
        signal_efficiency: 0,
        avg_phase_duration_s: 0,
        adverse_events_count: 0,
        total_delay_veh_hrs: 0,
      }
      return
    }

    // If the RL model has not been trained yet, explicitly keep it empty/zero
    const trainedModels = useSimulationStore.getState().trainedModels
    if (key !== 'baseline' && !trainedModels.includes(key)) {
      metricsMap[key] = {
        episode_id: key,
        session_id: 'empty',
        duration_s: 0,
        n_vehicles: 0,
        avg_wait_s: 0,
        per_type: {},
        per_arm: {},
        throughput_vph: 0,
        green_utilisation: 0,
        collision_count: 0,
        violation_count: 0,
        signal_efficiency: 0,
        avg_phase_duration_s: 0,
        adverse_events_count: 0,
        total_delay_veh_hrs: 0,
      }
      return
    }

    // 1. Baseline: prefer lastSimulationMetrics (same source as Live Stats panel)
    //    so KPI cards and the side panel always agree on the same numbers.
    //    Fall back to sessionStore.baselineMetrics for training-mode comparisons.
    if (key === 'baseline') {
      const liveMet = lastSimulationMetrics['baseline']
      if (liveMet) {
        metricsMap[key] = liveMet
      } else if (baselineMetrics) {
        metricsMap[key] = baselineMetrics
      } else {
        metricsMap[key] = {
          episode_id: 'baseline',
          session_id: 'empty',
          duration_s: 0,
          n_vehicles: 0,
          avg_wait_s: 0,
          per_type: {},
          per_arm: {},
          throughput_vph: 0,
          green_utilisation: 0,
          collision_count: 0,
          violation_count: 0,
          signal_efficiency: 0,
          avg_phase_duration_s: 0,
          adverse_events_count: 0,
          total_delay_veh_hrs: 0,
        }
      }
      return
    }

    // 2. Otherwise use the live metrics computed centrally in useSocket
    //    (_computeLiveSimulationMetrics) — kept in lastSimulationMetrics so the
    //    KPI cards and the live stats panel always agree on the same numbers.
    if (lastSimulationMetrics[key]) {
      metricsMap[key] = lastSimulationMetrics[key]
      return
    }

    // 4. Output clean empty metrics block if not running and no past simulation exists
    metricsMap[key] = {
      episode_id: key,
      session_id: 'empty',
      duration_s: 0,
      n_vehicles: 0,
      avg_wait_s: 0,
      per_type: {},
      per_arm: {},
      throughput_vph: 0,
      green_utilisation: 0,
      collision_count: 0,
      violation_count: 0,
      signal_efficiency: 0,
      avg_phase_duration_s: 0,
      adverse_events_count: 0,
      total_delay_veh_hrs: 0,
    }
  })

  return (
    <div className="flex flex-wrap gap-4 w-full">
      {/* 1. Avg Wait Time */}
      <ComparativeKpiCard
        label="Avg Wait Delay"
        activeKeys={activeKeys}
        metricsMap={metricsMap}
        metricKey="avg_wait_s"
        unit="s"
        lowerIsBetter
      />

      {/* 2. Throughput */}
      <ComparativeKpiCard
        label="Flow Throughput"
        activeKeys={activeKeys}
        metricsMap={metricsMap}
        metricKey="throughput_vph"
        unit="vph"
        formatVal={(v) => Math.round(v).toString()}
      />

      {/* 3. Green Utilisation */}
      <ComparativeKpiCard
        label="Green Signal Utilisation"
        activeKeys={activeKeys}
        metricsMap={metricsMap}
        metricKey="green_utilisation"
        unit="%"
      />

      {/* 4. Coordination Efficiency */}
      <ComparativeKpiCard
        label="Signal Coordination"
        activeKeys={activeKeys}
        metricsMap={metricsMap}
        metricKey="signal_efficiency"
        unit="%"
      />

      {/* 5. Safety Incidents */}
      <ComparativeKpiCard
        label="Safety Incidents"
        activeKeys={activeKeys}
        metricsMap={metricsMap}
        metricKey="collision_count"
        unit=""
        lowerIsBetter
        formatVal={(v) => Math.round(v).toString()}
      />
    </div>
  )
}
