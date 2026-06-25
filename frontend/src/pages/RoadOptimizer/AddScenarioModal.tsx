import React, { useEffect, useState } from 'react'
import type { ScenarioTypeDefinition, Scenario, TrainingDepth, IntersectionConfig } from './types'

const API = '/api/optimizer'

interface Props {
  onAdd: (scenario: Omit<Scenario, 'status' | 'progress' | 'current_episode' | 'total_episodes' | 'live_reward' | 'kpi' | 'error'>) => void
  onClose: () => void
  intersection: IntersectionConfig
}

const PHASE_SCHEMES = [
  { value: '2phase', label: '2-Phase' },
  { value: '4phase', label: '4-Phase' },
  { value: '5phase', label: '5-Phase (default)' },
  { value: '6phase', label: '6-Phase' },
]

export default function AddScenarioModal({ onAdd, onClose, intersection }: Props) {
  const [scenarioTypes, setScenarioTypes] = useState<ScenarioTypeDefinition[]>([])
  const [selectedType, setSelectedType] = useState<string>('free_left')
  const [depth, setDepth] = useState<TrainingDepth>('quick')
  const [label, setLabel] = useState('')
  const [phaseScheme, setPhaseScheme] = useState('4phase')
  const [extraArmTarget, setExtraArmTarget] = useState(intersection.arms + 1)

  // Custom design state
  const activeArms = intersection.arms === 3 ? ['N', 'E', 'W'] : ['N', 'S', 'E', 'W']
  const [activeArm, setActiveArm] = useState<string>('N')
  const [laneCounts, setLaneCounts] = useState<Record<string, number>>(() => {
    const res: Record<string, number> = {}
    activeArms.forEach(a => { res[a] = intersection.lanes_per_arm || 3 })
    return res
  })
  const [laneDirections, setLaneDirections] = useState<Record<string, string[]>>(() => {
    const res: Record<string, string[]> = {}
    activeArms.forEach(a => {
      res[a] = ['straight', 'straight', 'straight', 'straight', 'straight']
    })
    return res
  })
  const [laneSignals, setLaneSignals] = useState<Record<string, string[]>>(() => {
    const res: Record<string, string[]> = {}
    activeArms.forEach(a => {
      res[a] = ['standard', 'standard', 'standard', 'standard', 'standard']
    })
    return res
  })

  useEffect(() => {
    fetch(`${API}/scenario-types`)
      .then(r => r.json())
      .then(d => {
        const types = (d.scenario_types || []).filter((t: ScenarioTypeDefinition) => t.type !== 'baseline')
        setScenarioTypes(types)
      })
      .catch(() => {})
  }, [])

  const selectedDef = scenarioTypes.find(t => t.type === selectedType)

  const handleAdd = () => {
    const def = scenarioTypes.find(t => t.type === selectedType)
    const finalLabel = label.trim() || def?.label || selectedType
    const scenarioId = `scen_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

    const userOverrides: Record<string, any> = {}
    if (selectedType === 'custom_design') {
      const activeLaneConfig: Record<string, number> = {}
      const activeLaneDirections: Record<string, string[]> = {}
      const activeLaneSignals: Record<string, string[]> = {}
      
      activeArms.forEach(arm => {
        const count = laneCounts[arm]
        activeLaneConfig[arm] = count
        activeLaneDirections[arm] = laneDirections[arm].slice(0, count)
        activeLaneSignals[arm] = laneSignals[arm].slice(0, count)
      })

      userOverrides.lane_config = activeLaneConfig
      userOverrides.lane_directions = activeLaneDirections
      userOverrides.lane_signals = activeLaneSignals
    }

    onAdd({
      scenario_id: scenarioId,
      label: finalLabel,
      scenario_type: selectedType,
      training_depth: depth,
      phase_scheme: selectedType === 'phase_change' ? phaseScheme : undefined,
      extra_arm_target: selectedType === 'extra_arm' ? extraArmTarget : undefined,
      user_overrides: userOverrides,
      sim_config_summary: {},
    })
    onClose()
  }

  return (
    <div className="ro-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ro-modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div className="ro-modal-title">Add Scenario</div>
          <button className="ro-btn ro-btn-ghost" onClick={onClose} id="ro-modal-close-btn">✕</button>
        </div>

        {/* Scenario type grid */}
        <div className="ro-card-title">Choose Modification</div>
        <div className="ro-type-grid">
          {scenarioTypes.map(t => (
            <button
              key={t.type}
              id={`ro-type-${t.type}`}
              className={`ro-type-option ${selectedType === t.type ? 'selected' : ''}`}
              onClick={() => setSelectedType(t.type)}
              style={selectedType === t.type ? { borderColor: t.color + '80', background: t.color + '12' } : {}}
            >
              <div className="ro-type-label">{t.label}</div>
              <div className="ro-type-desc">{t.description}</div>
            </button>
          ))}
        </div>

        {/* Extra options for specific types */}
        {selectedType === 'phase_change' && (
          <div className="ro-field" style={{ marginBottom: 12 }}>
            <label className="ro-label">Target Phase Scheme</label>
            <select className="ro-select" value={phaseScheme} onChange={e => setPhaseScheme(e.target.value)} id="ro-phase-scheme-select">
              {PHASE_SCHEMES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        )}

        {selectedType === 'extra_arm' && (
          <div className="ro-field" style={{ marginBottom: 12 }}>
            <label className="ro-label">Target Arm Count (current: {intersection.arms})</label>
            <input
              id="ro-extra-arm-input"
              type="number"
              min={intersection.arms + 1}
              max={6}
              className="ro-input"
              value={extraArmTarget}
              onChange={e => setExtraArmTarget(+e.target.value)}
            />
          </div>
        )}

        {selectedType === 'custom_design' && (
          <div style={{ marginTop: 16, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 16, background: 'rgba(0,0,0,0.2)', marginBottom: 16 }}>
            <div className="ro-card-title" style={{ fontSize: 13, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Custom Lane Layout Designer</div>
            
            {/* Tabs for N, S, E, W */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 8 }}>
              {activeArms.map(arm => {
                const labelMap: Record<string, string> = { N: 'North', S: 'South', E: 'East', W: 'West' }
                return (
                  <button
                    key={arm}
                    type="button"
                    onClick={() => setActiveArm(arm)}
                    className={`ro-btn ${activeArm === arm ? 'ro-btn-primary' : 'ro-btn-secondary'}`}
                    style={{ padding: '4px 12px', fontSize: 12, height: 'auto', background: activeArm === arm ? undefined : 'rgba(255,255,255,0.03)' }}
                  >
                    {labelMap[arm] || arm}
                  </button>
                )
              })}
            </div>

            {/* Lane Count selector for active arm */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span className="ro-label" style={{ fontSize: 12, margin: 0 }}>Number of Lanes:</span>
              <select
                className="ro-select"
                style={{ width: 80, padding: '4px 8px', fontSize: 12, height: 28 }}
                value={laneCounts[activeArm]}
                onChange={e => {
                  const val = +e.target.value
                  setLaneCounts(prev => ({ ...prev, [activeArm]: val }))
                }}
              >
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* List of lane configurations */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Array.from({ length: laneCounts[activeArm] }).map((_, idx) => {
                const dirVal = laneDirections[activeArm][idx] || 'straight'
                const sigVal = laneSignals[activeArm][idx] || 'standard'

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 10,
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.04)'
                    }}
                  >
                    <div style={{ width: 90, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                      Lane {idx + 1} {idx === 0 ? '(Inner)' : idx === laneCounts[activeArm] - 1 ? '(Outer)' : ''}
                    </div>

                    {/* Direction Dropdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Allowed Turns</span>
                      <select
                        className="ro-select"
                        style={{ padding: '4px 8px', fontSize: 11, height: 28 }}
                        value={dirVal}
                        onChange={e => {
                          const val = e.target.value
                          setLaneDirections(prev => {
                            const arr = [...prev[activeArm]]
                            arr[idx] = val
                            return { ...prev, [activeArm]: arr }
                          })
                        }}
                      >
                        <option value="straight">Straight Only</option>
                        <option value="left">Left Turn Only</option>
                        <option value="right">Right Turn Only</option>
                        <option value="uturn">U-Turn Only</option>
                        <option value="free_left">Free Left Turn</option>
                        <option value="straight_left">Straight or Left</option>
                        <option value="straight_right">Straight or Right</option>
                      </select>
                    </div>

                    {/* Signal Dropdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Signal Light Type</span>
                      <select
                        className="ro-select"
                        style={{ padding: '4px 8px', fontSize: 11, height: 28 }}
                        value={sigVal}
                        onChange={e => {
                          const val = e.target.value
                          setLaneSignals(prev => {
                            const arr = [...prev[activeArm]]
                            arr[idx] = val
                            return { ...prev, [activeArm]: arr }
                          })
                        }}
                      >
                        <option value="standard">Standard 3-Light</option>
                        <option value="left_arrow">Left Arrow Signal</option>
                        <option value="right_arrow">Right Arrow Signal</option>
                        <option value="uturn_arrow">U-Turn Arrow Signal</option>
                        <option value="none">No Signal (Continuous)</option>
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Custom label */}
        <div className="ro-field" style={{ marginBottom: 16 }}>
          <label className="ro-label">Scenario Label (optional)</label>
          <input
            id="ro-scenario-label-input"
            type="text"
            className="ro-input"
            placeholder={selectedDef?.label || 'e.g. Free Left - Option A'}
            value={label}
            onChange={e => setLabel(e.target.value)}
          />
        </div>

        {/* Training depth */}
        <div className="ro-card-title">Training Depth</div>
        <div className="ro-depth-toggle" style={{ marginBottom: 20 }}>
          {(['quick', 'full'] as TrainingDepth[]).map(d => (
            <button
              key={d}
              id={`ro-depth-${d}`}
              className={`ro-depth-option ${depth === d ? 'selected' : ''}`}
              onClick={() => setDepth(d)}
            >
              <div className="ro-depth-option-title">{d === 'quick' ? 'Quick' : 'Full'}</div>
              <div className="ro-depth-option-sub">
                {d === 'quick' ? '80 episodes · ~30s · Mock env' : '400 episodes · ~2 min · Enriched physics'}
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="ro-btn ro-btn-secondary" onClick={onClose} id="ro-cancel-btn">Cancel</button>
          <button className="ro-btn ro-btn-primary" onClick={handleAdd} id="ro-add-scenario-btn" disabled={!selectedType}>
            Add Scenario
          </button>
        </div>
      </div>
    </div>
  )
}
