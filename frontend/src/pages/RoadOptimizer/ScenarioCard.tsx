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
  availableModelKeys: string[]
  onModelChange: (scenarioId: string, model: string) => void
}

function KpiChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="ro-kpi-chip">
      {label}: <span>{value}</span>
    </div>
  )
}

export default function ScenarioCard({
  scenario,
  intersection,
  isRunMode,
  onRun,
  onRemove,
  onShowSim,
  isAnyVisualSimRunning = false,
  availableModelKeys,
  onModelChange
}: Props) {
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

      {/* Model Selection Dropdown and Simulation Action Buttons */}
      {!isRunMode && (
        <div style={{ marginTop: 12, width: '100%' }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.05em' }}>
            Evaluation Model
          </div>
          <div style={{ position: 'relative', width: '100%' }}>
            <select
              className="ro-select"
              style={{
                background: '#090a0f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '11px',
                fontWeight: 600,
                padding: '6px 24px 6px 10px',
                cursor: (scenario.status === 'running' || isThisSimRunning) ? 'not-allowed' : 'pointer',
                outline: 'none',
                width: '100%',
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none'
              }}
              value={scenario.evaluation_model || (isBaseline ? 'baseline_fixed' : 'rl1')}
              disabled={scenario.status === 'running' || isThisSimRunning}
              onChange={(e) => onModelChange(scenario.scenario_id, e.target.value)}
            >
              {availableModelKeys.map(key => {
                let label = key;
                if (key === 'baseline') label = 'Webster Adaptive (No RL)';
                else if (key === 'baseline_fixed') label = 'Fixed-Time Baseline (No RL)';
                else if (key === 'rl1') label = 'Pre-trained PPO Model';
                else if (key === 'rl2') label = 'Pre-trained DQN Model';
                else if (key === 'rl3') label = 'Pre-trained SAC Model';
                else if (key === 'rl4') label = 'Pre-trained A2C Model';
                return <option key={key} value={key}>{label}</option>
              })}
            </select>
            <div
              style={{
                position: 'absolute',
                top: '50%',
                right: '10px',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: '#94a3b8',
                fontSize: '8px'
              }}
            >
              ▼
            </div>
          </div>
        </div>
      )}

      {isRunMode && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, width: '100%', alignItems: 'center' }}>
          {/* Dropdown Next to Buttons */}
          <div style={{ flex: 1.2, position: 'relative' }}>
            <select
              className="ro-select"
              style={{
                background: '#090a0f',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '11px',
                fontWeight: 600,
                padding: '6px 24px 6px 10px',
                cursor: (scenario.status === 'running' || isThisSimRunning) ? 'not-allowed' : 'pointer',
                outline: 'none',
                width: '100%',
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none'
              }}
              value={scenario.evaluation_model || (isBaseline ? 'baseline_fixed' : 'rl1')}
              disabled={scenario.status === 'running' || isThisSimRunning}
              onChange={(e) => onModelChange(scenario.scenario_id, e.target.value)}
            >
              {availableModelKeys.map(key => {
                let label = key;
                if (key === 'baseline') label = 'Webster Adaptive';
                else if (key === 'baseline_fixed') label = 'Fixed-Time';
                else if (key === 'rl1') label = 'Pre-trained PPO';
                else if (key === 'rl2') label = 'Pre-trained DQN';
                else if (key === 'rl3') label = 'Pre-trained SAC';
                else if (key === 'rl4') label = 'Pre-trained A2C';
                return <option key={key} value={key}>{label}</option>
              })}
            </select>
            <div
              style={{
                position: 'absolute',
                top: '50%',
                right: '10px',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                color: '#94a3b8',
                fontSize: '8px'
              }}
            >
              ▼
            </div>
          </div>

          {/* Action Button(s) */}
          {(scenario.status === 'running' || isThisSimRunning) ? (
            <button
              className="ro-btn ro-btn-secondary"
              style={{ flex: 1, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }}
              onClick={() => onShowSim?.(scenario)}
            >
              <span>📺</span>
              View Sim
            </button>
          ) : scenario.status === 'done' ? (
            <React.Fragment>
              <button
                className="ro-btn ro-btn-secondary"
                style={{ flex: 1, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px', whiteSpace: 'nowrap' }}
                onClick={() => onShowSim?.(scenario)}
                title={isOtherSimRunning ? 'Close the current simulation first' : 'Watch visual simulation playback'}
                disabled={isOtherSimRunning}
              >
                <span>📺</span>
                View
              </button>
              <button
                id={`ro-run-${scenario.scenario_id}`}
                className="ro-btn ro-btn-primary"
                style={{ flex: 0.8, fontSize: 12, opacity: isOtherSimRunning ? 0.45 : 1, cursor: isOtherSimRunning ? 'not-allowed' : 'pointer', padding: '8px 4px', whiteSpace: 'nowrap' }}
                onClick={() => onRun(scenario.scenario_id)}
                disabled={isOtherSimRunning}
                title={isOtherSimRunning ? 'Stop the running simulation first' : 'Re-run training/evaluation'}
              >
                Re-run
              </button>
            </React.Fragment>
          ) : (
            <button
              id={`ro-run-${scenario.scenario_id}`}
              className="ro-btn ro-btn-primary"
              style={{ flex: 1, fontSize: 12, opacity: isOtherSimRunning ? 0.45 : 1, cursor: isOtherSimRunning ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => {
                onRun(scenario.scenario_id)
              }}
              disabled={isOtherSimRunning}
              title={isOtherSimRunning ? 'Stop the running simulation first' : ''}
            >
              {scenario.status === 'error' ? 'Retry' : 'Run'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

