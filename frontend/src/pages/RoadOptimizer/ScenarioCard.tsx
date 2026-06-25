import React from 'react'
import type { Scenario, IntersectionConfig } from './types'
import { useSimulationStore } from '../../store/simulationStore'
import { useConfigStore } from '../../store/configStore'

const SCENARIO_COLORS: Record<string, string> = {
  baseline:          '#64748b',
  free_left:         '#10b981',
  u_turn_mid:        '#6366f1',
  extra_arm:         '#f59e0b',
  remove_lane:       '#ef4444',
  phase_change:      '#ec4899',
  add_pedestrian:    '#14b8a6',
  remove_pedestrian: '#94a3b8',
}



interface Props {
  scenario: Scenario
  intersection: IntersectionConfig
  isRunMode: boolean
  onRun: (id: string) => void
  onRemove: (id: string) => void
  onShowSim?: (s: Scenario) => void
  isAnyVisualSimRunning?: boolean
}

function KpiChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ro-kpi-chip">
      {label}: <span>{value}</span>
    </div>
  )
}

export default function ScenarioCard({ scenario, intersection, isRunMode, onRun, onRemove, onShowSim, isAnyVisualSimRunning = false }: Props) {
  const store = useSimulationStore()
  const { simConfig } = useConfigStore()

  const color = SCENARIO_COLORS[scenario.scenario_type] || '#64748b'
  const isBaseline = scenario.scenario_type === 'baseline'

  const maxDur = Number(simConfig.simulation_duration_s ?? 1800)
  const isThisSimRunning = store.sessionId === `road_opt_visual_${scenario.scenario_id}` &&
                           (store.isRunning || store.isPaused) &&
                           store.simTimeS < maxDur
  // A different scenario's visual sim is running — disable our run button
  const isOtherSimRunning = isAnyVisualSimRunning && !isThisSimRunning

  const cardClass = [
    'ro-scenario-card',
    (scenario.status === 'running' || isThisSimRunning) ? 'is-running' : '',
    (scenario.status === 'done' && !isThisSimRunning) ? 'is-done' : '',
    scenario.status === 'error' ? 'is-error' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cardClass}>
      {/* Remove button (not for baseline, and only when NOT in run mode) */}
      {!isBaseline && !isRunMode && (
        <button
          className="ro-btn ro-btn-ghost"
          id={`ro-remove-${scenario.scenario_id}`}
          style={{ position: 'absolute', top: 10, right: 10, padding: '4px 6px', fontSize: 12 }}
          onClick={() => onRemove(scenario.scenario_id)}
          title="Remove scenario"
        >
          ✕
        </button>
      )}

      {/* Type badge */}
      <div
        className="ro-scenario-type-badge"
        style={{ background: color + '18', color, borderColor: color + '40', border: '1px solid' }}
      >
        <span>{scenario.scenario_type.replace(/_/g, ' ')}</span>
      </div>

      {/* Label */}
      <div className="ro-scenario-label">{scenario.label}</div>

      {/* Meta */}
      <div className="ro-scenario-meta">
        {scenario.training_depth === 'quick' ? 'Quick' : 'Full'} · {intersection.arms} arms · {intersection.traffic_volume_vph.toLocaleString()} vph
      </div>

      {/* Progress bar (when running) */}
      {(scenario.status === 'running' || isThisSimRunning) && (
        <div>
          <div className="ro-progress-bar">
            <div className="ro-progress-fill" style={{ 
              width: isThisSimRunning 
                ? `${Math.min(100, Math.round((store.simTimeS / maxDur) * 100))}%`
                : `${scenario.progress}%` 
            }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
            <div className="ro-spinner" />
            {isThisSimRunning 
              ? `Simulating... ${Math.min(100, Math.round((store.simTimeS / maxDur) * 100))}%`
              : `Evaluating... ${scenario.progress}%`
            }
          </div>
        </div>
      )}

      {/* Error */}
      {scenario.status === 'error' && (
        <div style={{ fontSize: 11, color: '#f87171', marginTop: 8 }}>
          Error: {scenario.error || 'Simulation failed'}
        </div>
      )}

      {/* KPI chips (when done) */}
      {scenario.status === 'done' && !isThisSimRunning && scenario.kpi && (
        <div className="ro-kpi-chips">
          <KpiChip label="Wait" value={`${scenario.kpi.avg_wait_s}s`} />
          <KpiChip label="Throughput" value={`${scenario.kpi.throughput_vph} vph`} />
          <KpiChip label="Flow Eff." value={`${(scenario.kpi.flow_efficiency * 100).toFixed(0)}%`} />
        </div>
      )}

      {/* Unified Simulation Action Button (only in run mode) */}
      {isRunMode && (
        (scenario.status === 'running' || isThisSimRunning) ? (
          <button
            className="ro-btn ro-btn-secondary"
            style={{ width: '100%', marginTop: 12, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            onClick={() => onShowSim?.(scenario)}
          >
            <span>📺</span>
            View Simulation
          </button>
        ) : scenario.status === 'done' ? (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, width: '100%' }}>
            <button
              className="ro-btn ro-btn-secondary"
              style={{ flex: 1.2, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => onShowSim?.(scenario)}
              title={isOtherSimRunning ? 'Close the current simulation first' : 'Watch visual simulation playback'}
              disabled={isOtherSimRunning}
            >
              <span>📺</span>
              View Sim
            </button>
            <button
              id={`ro-run-${scenario.scenario_id}`}
              className="ro-btn ro-btn-primary"
              style={{ flex: 1, fontSize: 12, opacity: isOtherSimRunning ? 0.45 : 1, cursor: isOtherSimRunning ? 'not-allowed' : 'pointer' }}
              onClick={() => onRun(scenario.scenario_id)}
              disabled={isOtherSimRunning}
              title={isOtherSimRunning ? 'Stop the running simulation first' : 'Re-run training/evaluation'}
            >
              Re-run
            </button>
          </div>
        ) : (
          <button
            id={`ro-run-${scenario.scenario_id}`}
            className="ro-btn ro-btn-primary"
            style={{ width: '100%', marginTop: 12, fontSize: 12, opacity: isOtherSimRunning ? 0.45 : 1, cursor: isOtherSimRunning ? 'not-allowed' : 'pointer' }}
            onClick={() => {
              onRun(scenario.scenario_id)
            }}
            disabled={isOtherSimRunning}
            title={isOtherSimRunning ? 'Stop the running simulation first' : ''}
          >
            {scenario.status === 'error' ? 'Retry Simulation' : 'Run Simulation'}
          </button>
        )
      )}
    </div>
  )
}

