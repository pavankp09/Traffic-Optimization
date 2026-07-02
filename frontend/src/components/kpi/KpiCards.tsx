import React from 'react'
import HelpPopover from '../shared/HelpPopover'
import { useSimulationStore } from '../../store/simulationStore'
import { useSessionStore } from '../../store/sessionStore'
import { MODEL_METADATA } from '../../utils/constants'
import {
  buildImpactMetricCard,
  getPotentialCarbonCreditValueInr,
  type ImpactMetricCardData,
  type ImpactMetricKind,
} from '../../utils/impactMetrics'
import type { EpisodeMetrics } from '../../types'

const METRIC_HELP: Record<string, string> = {
  avg_wait_s: "### Average Wait Delay\nThe average time in seconds that vehicles spend completely stopped at the intersection waiting for a green signal.\n- **Goal**: Minimize this value to reduce overall commuter travel time and peak delays.\n- **Formula**:\n$$\\text{Avg Wait} = \\frac{\\sum_{i=1}^{N} d_i}{N}$$\nWhere $d_i$ is the individual stopped delay for vehicle $i$ and $N$ is the total count of vehicles.",
  throughput_vph: "### Flow Throughput\nThe volume of vehicles successfully cleared through the intersection per hour (vehicles per hour).\n- **Goal**: Maximize this value to increase intersection volume capacity and prevent street congestion gridlocks.\n- **Formula**:\n$$\\text{Throughput} = \\frac{3600 \\cdot N_{\\text{cleared}}}{T_{\\text{elapsed}}}$$\nWhere $N_{\\text{cleared}}$ is the count of vehicles cleared and $T_{\\text{elapsed}}$ is simulated seconds.",
  green_utilisation: "### Green Light Utilisation\nThe percentage of green light duration where active queue discharge occurs (i.e., green time is actively utilized by moving vehicles).\n- **Goal**: Maximize this to avoid wasting green time on empty approach lanes.\n- **Formula**:\n$$\\text{Green Util} = \\frac{\\sum T_{\\text{discharge}}}{T_{\\text{green\\_total}}} \\times 100\\%$$",
  fuel_index_ml_veh: "### Fuel Consumption Index\nThe average fuel consumed per cleared vehicle, measured in milliliters (mL).\n- **Goal**: Minimize this value. Lower values indicate higher fuel efficiency and less idling at the intersection.\n- **Formula**:\n$$\\text{Fuel Index} = \\frac{\\sum \\text{Fuel}_i \\text{ (mL)}}{\\text{Total Vehicles}}$$\nCalculated based on Hyderabad-calibrated vehicle idle rates.",
  carbon_index_g_veh: "### Carbon Footprint Index\nThe average carbon dioxide ($CO_2$) emitted per cleared vehicle, measured in grams (g).\n- **Goal**: Minimize this value to reduce environmental impact and greenhouse gas emissions.\n- **Formula**:\n$$\\text{Carbon Index} = \\frac{\\sum \\text{CO}_2 \\text{ (g)}}{\\text{Total Vehicles}}$$\nCalculated based on engine emissions per vehicle type profile."
}

interface ComparativeKpiCardProps {
  label: string
  activeKeys: string[]
  metricsMap: Record<string, EpisodeMetrics>
  metricKey: keyof EpisodeMetrics
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
    const color = meta.color
    return { key, val, label: meta.label, color }
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
                <span className="text-[10px] font-semibold font-sans uppercase tracking-wide truncate max-w-[140px]" style={{ color }}>
                  {modelLabel.replace('Agent ', '').replace(' Agent', '')}
                </span>
                <div className="flex items-center">
                  <span className="text-[13px] font-bold font-mono leading-none" style={{ color: val > 0 ? '#f1f5f9' : '#475569' }}>
                    {formatVal(val)}
                  </span>
                  {unit && <span className="text-[9px] text-slate-500 font-mono font-semibold ml-0.5">{unit}</span>}
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

interface ImpactKpiCardProps {
  data: ImpactMetricCardData
  kind: ImpactMetricKind
}

function getImpactHelp(kind: ImpactMetricKind, data: ImpactMetricCardData): string {
  const creditValue = kind === 'carbon' && data.potentialCarbonCreditInr !== undefined
    ? data.potentialCarbonCreditInr.toFixed(2)
    : null

  const baseText = kind === 'fuel'
    ? "### Fuel Idle Waste\nTotal absolute idle fuel wasted from stopped delay across all simulated vehicles, alongside average waste per vehicle.\n- **Primary Value**: Total fleet idle fuel consumed in liters (L).\n- **Secondary Value**: Average idle fuel consumed per vehicle in milliliters (mL/veh).\n- **Comparison Deltas**: Percentage improvement is calculated using the **per-vehicle average** to ensure a fair, throughput-independent comparison."
    : "### CO2 Emissions (Idle)\nTotal absolute carbon dioxide ($CO_2$) emitted during idling across all simulated vehicles, alongside average emissions per vehicle.\n- **Primary Value**: Total fleet idle $CO_2$ emitted in kilograms (kg).\n- **Secondary Value**: Average idle $CO_2$ emitted per vehicle in grams (g/veh).\n- **Comparison Deltas**: Percentage improvement is calculated using the **per-vehicle average** to ensure a fair, throughput-independent comparison."

  if (kind !== 'carbon' || creditValue === null) return baseText
  return `${baseText}\n- **Potential fleet-wide credit value**: ₹${creditValue} at ₹2,000/tCO2 based on total fleet avoided carbon.\n- **Estimate only**: not an issued credit.`
}

function ImpactKpiCard({ data, kind }: ImpactKpiCardProps) {
  const maxVal = Math.max(...data.rows.map((row) => row.value), 1)
  const baselineRow = data.rows.find((row) => row.key === 'baseline')
  const baselineVal = baselineRow?.perVehicleValue

  return (
    <div className="flex-1 min-w-[220px] bg-[#0c1018] border border-white/[0.07] rounded-2xl p-4 flex flex-col gap-3 shadow-[0_4px_24px_rgba(0,0,0,0.4)] hover:border-white/[0.12] hover:shadow-[0_4px_32px_rgba(0,0,0,0.55)] transition-all duration-300 group">
      <div className="flex items-center gap-2 pb-2 border-b border-white/[0.05]">
        <span className="text-[10px] font-bold font-mono text-slate-400 tracking-widest uppercase">{data.label}</span>
        <HelpPopover text={getImpactHelp(kind, data)} position="top" />
      </div>

      <div className="flex flex-col gap-2.5">
        {data.rows.map(({ key, value, perVehicleValue, secondaryText }) => {
          const meta = MODEL_METADATA[key] ?? { label: key, color: '#fff' }
          const pct = value > 0 ? Math.max(3, Math.min(100, (value / maxVal) * 100)) : 0

          let deltaHtml = null
          if (key !== 'baseline' && baselineVal !== undefined && baselineVal > 0 && perVehicleValue > 0) {
            const diff = baselineVal - perVehicleValue // lower is better
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
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold font-sans uppercase tracking-wide truncate max-w-[140px]" style={{ color: meta.color }}>
                    {meta.label.replace('Agent ', '').replace(' Agent', '')}
                  </span>
                </div>
                <div className="flex items-baseline flex-shrink-0">
                  <span className="text-[13px] font-bold font-mono leading-none" style={{ color: value > 0 ? '#f1f5f9' : '#475569' }}>
                    {value.toFixed(1)}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono font-semibold ml-0.5">{data.unit}</span>
                  {secondaryText && (
                    <span className="text-[8.5px] text-slate-400 font-mono font-semibold ml-1 leading-none">
                      ({secondaryText})
                    </span>
                  )}
                  {deltaHtml}
                </div>
              </div>

              <div className="w-full h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500 ease-out rounded-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: value > 0 ? meta.color : 'transparent',
                    opacity: value > 0 ? 0.8 : 0,
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
  const lastSimulationMetrics = useSimulationStore((s) => s.viewMode === 'split' ? s.splitLastSimulationMetrics : s.lastSimulationMetrics)

  // Training metrics state
  const baselineMetrics = useSessionStore((s) => s.baselineMetrics)
  const isTraining = useSessionStore((s) => s.isTraining)
  const trainingModelKey = useSessionStore((s) => s.trainingModelKey)
  const splitLastSimulationMetrics = useSimulationStore((s) => s.splitLastSimulationMetrics)

  // Determine active keys based on current viewMode
  const activeKeys = viewMode === 'single'
    ? [selectedModelSingle]
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
        fuel_index_ml_veh: 0,
        carbon_index_g_veh: 0,
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
        fuel_index_ml_veh: 0,
        carbon_index_g_veh: 0,
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
      } else if (viewMode === 'single' && baselineMetrics) {
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
          fuel_index_ml_veh: 0,
          carbon_index_g_veh: 0,
        }
      }
      return
    }

    // 2. Otherwise use the live metrics computed centrally in useSocket
    //    (_computeLiveSimulationMetrics) — kept in lastSimulationMetrics so the
    //    KPI cards and the live stats panel always agree on the same numbers.
    const liveMetrics = viewMode === 'split' ? splitLastSimulationMetrics[key] : lastSimulationMetrics[key]
    if (liveMetrics) {
      metricsMap[key] = liveMetrics
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
      fuel_index_ml_veh: 0,
      carbon_index_g_veh: 0,
    }
  })

  const fuelImpact = buildImpactMetricCard({
    kind: 'fuel',
    mode: viewMode,
    activeKeys,
    metricsMap,
  })

  const carbonImpact = buildImpactMetricCard({
    kind: 'carbon',
    mode: viewMode,
    activeKeys,
    metricsMap,
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

      {/* 4. Fuel impact */}
      <ImpactKpiCard data={fuelImpact} kind="fuel" />

      {/* 5. Carbon impact */}
      <ImpactKpiCard data={carbonImpact} kind="carbon" />
    </div>
  )
}
