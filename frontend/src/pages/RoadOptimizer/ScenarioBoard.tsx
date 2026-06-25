import React, { useState } from 'react'
import type { Scenario, IntersectionConfig } from './types'
import ScenarioCard from './ScenarioCard'
import AddScenarioModal from './AddScenarioModal'

interface Props {
  scenarios: Scenario[]
  intersection: IntersectionConfig
  activeStep: number
  onDone: () => void
  onDoneSimulations?: () => void
  onAdd: (s: Omit<Scenario, 'status' | 'progress' | 'current_episode' | 'total_episodes' | 'live_reward' | 'kpi' | 'error'>) => void
  onRun: (id: string) => void
  onRemove: (id: string) => void
  onRunAll: () => void
  isBulkRunning: boolean
  queueLength: number
  onInjectDemo: () => void
  onShowSim?: (s: Scenario) => void
  isAnyVisualSimRunning?: boolean
  availableModelKeys: string[]
  onModelChange: (scenarioId: string, model: string) => void
}

export default function ScenarioBoard({
  scenarios,
  intersection,
  activeStep,
  onDone,
  onDoneSimulations,
  onAdd,
  onRun,
  onRemove,
  onRunAll,
  isBulkRunning,
  queueLength,
  onInjectDemo,
  onShowSim,
  isAnyVisualSimRunning = false,
  availableModelKeys,
  onModelChange,
}: Props) {
  const [showModal, setShowModal] = useState(false)

  const doneCount = scenarios.filter(s => s.status === 'done').length
  const runningCount = scenarios.filter(s => s.status === 'running').length

  // Scenarios other than baseline
  const hasModifications = scenarios.some(s => s.scenario_type !== 'baseline')
  
  // Show grid if there are custom scenarios OR if we are in run mode (to show baseline)
  const showGrid = hasModifications || activeStep === 3

  return (
    <div className="ro-scenarios-area">
      <div className="ro-scenarios-header">
        <div className="ro-section-header">
          Scenarios
          {doneCount > 0 && <span className="ro-section-chip">{doneCount} complete</span>}
          {runningCount > 0 && <span className="ro-section-chip" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
            <span className="ro-pulse">● </span>{runningCount} running
          </span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {activeStep === 3 && scenarios.length > 0 && (
            <>
              <button
                id="ro-run-all-btn"
                className={`ro-btn ${isBulkRunning ? 'ro-btn-bulk-running' : 'ro-btn-secondary ro-btn-run-all'}`}
                onClick={onRunAll}
                disabled={true}
                style={{ fontSize: 12 }}
              >
                {isBulkRunning ? (
                  <>
                    <div className="ro-spinner" style={{ display: 'inline-block', marginRight: 6 }} />
                    Running Queue ({queueLength} left)
                  </>
                ) : 'Run All Simulations'}
              </button>
              <button
                id="ro-done-sims-trigger"
                className="ro-btn ro-btn-primary"
                onClick={onDoneSimulations}
                disabled={doneCount === 0 || isBulkRunning}
                title={doneCount === 0 ? 'Run at least one simulation to continue' : undefined}
                style={{
                  fontSize: 12,
                  background: doneCount > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.04)',
                  borderColor: doneCount > 0 ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.12)',
                  color: doneCount > 0 ? '#34d399' : 'rgba(52, 211, 153, 0.35)',
                  border: `1px solid ${doneCount > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.1)'}`,
                  cursor: doneCount === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Done
              </button>
            </>
          )}
          {activeStep === 2 && (
            <>
              <button
                id="ro-load-demo-trigger"
                className="ro-btn ro-btn-secondary"
                onClick={onInjectDemo}
                style={{ fontSize: 12 }}
              >
                Load Demo Scenarios
              </button>
              <button
                id="ro-add-scenario-trigger"
                className="ro-btn ro-btn-primary"
                onClick={() => setShowModal(true)}
                style={{ fontSize: 12 }}
              >
                + Add Scenario
              </button>
              <button
                id="ro-done-adding-trigger"
                className="ro-btn ro-btn-primary"
                onClick={onDone}
                disabled={!hasModifications}
                title={!hasModifications ? 'Add at least one scenario to continue' : undefined}
                style={{
                  fontSize: 12,
                  background: hasModifications ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.04)',
                  borderColor: hasModifications ? 'rgba(16, 185, 129, 0.35)' : 'rgba(16, 185, 129, 0.12)',
                  color: hasModifications ? '#34d399' : 'rgba(52, 211, 153, 0.35)',
                  border: `1px solid ${hasModifications ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.1)'}`,
                  cursor: hasModifications ? 'pointer' : 'not-allowed',
                }}
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>

      {!showGrid ? (
        <div className="ro-empty">
          <div className="ro-empty-text" style={{ marginBottom: 0 }}>
            No custom road modifications added.<br />
            Define modifications to evaluate against the baseline intersection.
          </div>
        </div>
      ) : (
        <div className="ro-scenarios-grid">
          {scenarios.map(s => (
            <ScenarioCard
              key={s.scenario_id}
              scenario={s}
              intersection={intersection}
              isRunMode={activeStep === 3}
              onRun={onRun}
              onRemove={onRemove}
              onShowSim={onShowSim}
              isAnyVisualSimRunning={isAnyVisualSimRunning}
              availableModelKeys={availableModelKeys}
              onModelChange={onModelChange}
            />
          ))}
        </div>
      )}


      {showModal && (
        <AddScenarioModal
          onAdd={onAdd}
          onClose={() => setShowModal(false)}
          intersection={intersection}
        />
      )}
    </div>
  )
}
