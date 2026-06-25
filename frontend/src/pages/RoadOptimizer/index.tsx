import React, { useState, useCallback, useEffect, useRef } from 'react'
import './optimizer.css'
import type { Scenario, IntersectionConfig, LLMRecommendation } from './types'
import ScenarioBoard from './ScenarioBoard'
import ResultsPanel from './ResultsPanel'
import LLMReportPanel from './LLMReportPanel'
import ConfigModal from '../../components/ConfigModal'
import { useConfigStore } from '../../store/configStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useSocket } from '../../hooks/useSocket'
import SimCanvas from '../../components/SimCanvas'
import SimLiveStatsPanel from '../../components/SimLiveStatsPanel'
import PresetSelector from '../../components/PresetSelector'

const API = '/api/optimizer'

const DEFAULT_INTERSECTION: IntersectionConfig = {
  id: 'hitec_city',
  name: 'HITEC City Signal',
  arms: 4,
  lanes_per_arm: 3,
  traffic_volume_vph: 3200,
  vehicle_mix: 'hyderabad_mixed',
  traffic_pattern: 'morning_peak',
}

const BASELINE_SCENARIO: Scenario = {
  scenario_id: 'baseline',
  label: 'Baseline (Current State)',
  scenario_type: 'baseline',
  training_depth: 'quick',
  evaluation_model: 'baseline_fixed',
  status: 'idle',
  progress: 0,
  current_episode: 0,
  total_episodes: 80,
  live_reward: 0,
  kpi: null,
  error: null,
  sim_config_summary: {},
}

function getScenarioSimConfig(scenario: Scenario, baseConfig: any, intersection: IntersectionConfig) {
  let lanes = intersection.lanes_per_arm;
  let type = baseConfig.intersection_type || 'four_way';
  let arms = intersection.arms;
  let dedicatedTurns = baseConfig.dedicated_turn_lanes || 'right_only';
  let uTurn = baseConfig.u_turn_phase || false;
  let pedestrian = baseConfig.pedestrian_crossings || 'major_arms';
  let phaseScheme = baseConfig.phase_scheme || '5phase';

  const stype = scenario.scenario_type;

  if (stype === 'free_left') {
    type = arms === 4 ? 'four_way_free_left' : type;
    dedicatedTurns = 'both';
  } else if (stype === 'u_turn_mid') {
    uTurn = true;
  } else if (stype === 'extra_arm') {
    const target = scenario.extra_arm_target || (arms + 1);
    const resolvedArms = Math.min(Math.max(target, 3), 6);
    arms = resolvedArms;
    type = resolvedArms === 3 ? 't_junction' : resolvedArms === 4 ? 'four_way' : 'six_arm';
  } else if (stype === 'remove_lane') {
    lanes = Math.max(1, lanes - 1);
  } else if (stype === 'phase_change') {
    phaseScheme = scenario.phase_scheme || '4phase';
  } else if (stype === 'add_pedestrian') {
    pedestrian = 'all_arms';
  } else if (stype === 'remove_pedestrian') {
    pedestrian = 'disabled';
  }

  return {
    ...baseConfig,
    intersection_type: type,
    n_lanes: lanes,
    lanes_per_arm: lanes,
    u_turn_phase: uTurn,
    dedicated_turn_lanes: dedicatedTurns,
    pedestrian_crossings: pedestrian,
    phase_scheme: phaseScheme,
    ...(scenario.user_overrides || {}),
  };
}

function getRecommendedScenariosForLocation(presetId: string, timestamp: number): Scenario[] {
  const suffix = `${timestamp}_${Math.random().toString(36).slice(2, 5)}`;
  const baseline: Scenario = {
    scenario_id: 'baseline',
    label: 'Baseline (Current State)',
    scenario_type: 'baseline',
    training_depth: 'quick',
    status: 'idle',
    progress: 0,
    current_episode: 0,
    total_episodes: 80,
    live_reward: 0,
    kpi: null,
    error: null,
    sim_config_summary: {},
  };

  const list: Scenario[] = [baseline];

  if (
    presetId === 'hyd_hitec_city' ||
    presetId === 'hyd_gachibowli' ||
    presetId === 'hyd_madhapur' ||
    presetId === 'hyd_financial_district' ||
    presetId === 'hyd_raidurg' ||
    presetId === 'hyd_nanakramguda' ||
    presetId === 'hyd_kondapur'
  ) {
    list.push({
      scenario_id: `scen_left_${suffix}`,
      label: 'Free Left Turn Scheme',
      scenario_type: 'free_left',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
    list.push({
      scenario_id: `scen_uturn_${suffix}`,
      label: 'Mid-Block U-Turn Bypass',
      scenario_type: 'u_turn_mid',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
  } else if (presetId === 'hyd_old_city') {
    list.push({
      scenario_id: `scen_ped_${suffix}`,
      label: 'Pedestrian Crossing Zone',
      scenario_type: 'add_pedestrian',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
    list.push({
      scenario_id: `scen_left_${suffix}`,
      label: 'Free Left Turn Scheme',
      scenario_type: 'free_left',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
  } else if (presetId === 'hyd_sr_nagar') {
    list.push({
      scenario_id: `scen_ped_${suffix}`,
      label: 'School Pedestrian Safeguards',
      scenario_type: 'add_pedestrian',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
    list.push({
      scenario_id: `scen_uturn_${suffix}`,
      label: 'Mid-Block U-Turn Bypass',
      scenario_type: 'u_turn_mid',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
  } else if (presetId === 'hyd_lb_nagar') {
    list.push({
      scenario_id: `scen_left_${suffix}`,
      label: 'Heavy Free Left Turn',
      scenario_type: 'free_left',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
    list.push({
      scenario_id: `scen_remlane_${suffix}`,
      label: 'Remove Outer Arm Lane',
      scenario_type: 'remove_lane',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
  } else if (presetId === 'hyd_secunderabad') {
    list.push({
      scenario_id: `scen_ped_${suffix}`,
      label: 'Commuter Pedestrian Zone',
      scenario_type: 'add_pedestrian',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
    list.push({
      scenario_id: `scen_left_${suffix}`,
      label: 'Bus Free Left Bypass',
      scenario_type: 'free_left',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
  } else {
    // Default fallback scenarios (like hyd_test_location)
    list.push({
      scenario_id: `scen_left_${suffix}`,
      label: 'Free Left Turn Scheme',
      scenario_type: 'free_left',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
    list.push({
      scenario_id: `scen_uturn_${suffix}`,
      label: 'Mid-Block U-Turn Bypass',
      scenario_type: 'u_turn_mid',
      training_depth: 'quick',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    });
  }

  return list.map(scen => ({
    ...scen,
    evaluation_model: 'baseline_fixed'
  }));
}

export default function RoadOptimizerPage() {
  const { simConfig, adverseConfig, activePreset } = useConfigStore()
  const {
    selectedModelSingle,
    setSelectedModelSingle,
    setSessionId,
    setRunning,
    setPaused,
    clearFrames,
    isRunning,
    isPaused,
    simSpeed,
    setSimSpeed,
    simTimeS,
  } = useSimulationStore()
  const { emit, socket } = useSocket()

  const [intersection, setIntersection] = useState<IntersectionConfig>(DEFAULT_INTERSECTION)
  const [scenarios, setScenarios] = useState<Scenario[]>([BASELINE_SCENARIO])
  const [activeTab, setActiveTab] = useState<'config' | 'scenarios' | 'results' | 'report'>('config')
  const [runQueue, setRunQueue] = useState<string[]>([])
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [activeStep, setActiveStep] = useState<number>(1)
  const [maxUnlockedStep, setMaxUnlockedStep] = useState<number>(1)
  const [activeSimScenario, setActiveSimScenario] = useState<Scenario | null>(null)
  const [activeSimConfig, setActiveSimConfig] = useState<Record<string, any> | null>(null)
  const [availableModelKeys, setAvailableModelKeys] = useState<string[]>(['baseline', 'baseline_fixed'])
  const [rawModelsList, setRawModelsList] = useState<any[]>([])
  // Persist AI recommendation report across tab switches and track completion
  const [aiReport, setAiReport] = useState<LLMRecommendation | null>(null)
  const [aiRecommendationDone, setAiRecommendationDone] = useState(false)

  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => {
        const keys = ['baseline', 'baseline_fixed']
        const list = Array.isArray(data) ? data : (data.data || [])
        setRawModelsList(list)
        const modelNames = list.map((m: any) => (m.name || '').toUpperCase())
        if (modelNames.includes('PPO') || modelNames.includes('RL1')) keys.push('rl1')
        if (modelNames.includes('DQN') || modelNames.includes('RL2')) keys.push('rl2')
        if (modelNames.includes('SAC') || modelNames.includes('RL3')) keys.push('rl3')
        if (modelNames.includes('A2C') || modelNames.includes('RL4')) keys.push('rl4')
        setAvailableModelKeys(keys)
      })
      .catch(() => {
        setAvailableModelKeys(['baseline', 'baseline_fixed', 'rl1'])
      })
  }, [])

  // Default to Fixed-Time Baseline on optimizer page load
  useEffect(() => {
    setSelectedModelSingle('baseline_fixed')
  }, [setSelectedModelSingle])

  const getSelectedModelInfo = useCallback(() => {
    const isRl = selectedModelSingle.startsWith('rl')
    if (!isRl) return null

    const algoMap: Record<string, string> = {
      rl1: 'PPO',
      rl2: 'DQN',
      rl3: 'SAC',
      rl4: 'A2C',
    }
    const algoName = algoMap[selectedModelSingle] || 'PPO'
    const matched = rawModelsList.find((m: any) => (m.name || '').toUpperCase() === algoName.toUpperCase())

    let trainedDate = 'Pre-loaded baseline weights'
    if (matched && matched.saved_at) {
      try {
        const date = new Date(matched.saved_at)
        trainedDate = date.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }).replace(',', '')
      } catch {
        trainedDate = matched.saved_at
      }
    }

    return {
      name: `${algoName} Agent`,
      trainedDate,
    }
  }, [selectedModelSingle, rawModelsList])

  const oldSimStoreRef = useRef<{
    sessionId: string | null;
    isRunning: boolean;
    currentFrame: any | null;
  } | null>(null)

  const doneCount = scenarios.filter(s => s.status === 'done').length
  const runningCount = scenarios.filter(s => s.status === 'running').length
  const isBulkRunning = runQueue.length > 0 || runningCount > 0
  // True when any visual sim overlay is actively running (not just the SSE evaluations)
  const isAnyVisualSimRunning = (isRunning || isPaused) && !!useSimulationStore.getState().sessionId?.startsWith('road_opt_visual_')

  // Display-adjusted counts for the sidebar and scenario header chip.
  // A scenario that has SSE status='done' but whose visual canvas simulation is
  // still playing should appear as Running=1, Completed-1.
  // Derive the running scenario_id from the store sessionId (always 'road_opt_visual_<id>')
  // instead of activeSimScenario — activeSimScenario is nulled when the overlay closes
  // but the socket session keeps running.
  const _storeSessionId = useSimulationStore.getState().sessionId
  const visuallyRunningScenarioId = isAnyVisualSimRunning && _storeSessionId?.startsWith('road_opt_visual_')
    ? _storeSessionId.replace('road_opt_visual_', '')
    : null
  const visuallyRunningIsDone = visuallyRunningScenarioId
    ? (scenarios.find(s => s.scenario_id === visuallyRunningScenarioId)?.status === 'done')
    : false
  const displayDoneCount = visuallyRunningIsDone ? Math.max(0, doneCount - 1) : doneCount
  const displayRunningCount = runningCount + (isAnyVisualSimRunning ? 1 : 0)

  // ── Run scenario via SSE ──
  const handleRun = useCallback((scenarioId: string) => {
    const foundScenario = scenarios.find(s => s.scenario_id === scenarioId)
    if (!foundScenario) return

    const depth = foundScenario.training_depth

    // Reset state of the running scenario in scenarios array
    setScenarios(prev => prev.map(s =>
      s.scenario_id === scenarioId
        ? { ...s, status: 'running' as const, progress: 0, current_episode: 0, live_reward: 0, kpi: null, error: null }
        : s
    ))

    // Start actual simulation call
    const body = {
      intersection: {
        id: intersection.id,
        name: intersection.name,
        arms: intersection.arms,
        lanes_per_arm: intersection.lanes_per_arm,
        traffic_volume_vph: intersection.traffic_volume_vph,
        vehicle_mix: intersection.vehicle_mix,
        traffic_pattern: intersection.traffic_pattern,
      },
      scenario: {
        scenario_id: foundScenario.scenario_id,
        label: foundScenario.label,
        scenario_type: foundScenario.scenario_type,
        training_depth: foundScenario.training_depth,
        phase_scheme: foundScenario.phase_scheme,
        extra_arm_target: foundScenario.extra_arm_target,
        user_overrides: {
          simulation_duration_s: simConfig.simulation_duration_s,
          ...(foundScenario.user_overrides ?? {}),
        },
        evaluation_model: foundScenario.evaluation_model || (foundScenario.scenario_type === 'baseline' ? 'baseline_fixed' : 'rl1'),
      },
    }

    fetch(`${API}/run-scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(res => {
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      function processChunk() {
        reader.read().then(({ done, value }) => {
          if (done) return
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const dataLine = line.replace(/^data: /, '').trim()
            if (!dataLine) continue
            try {
              const event = JSON.parse(dataLine)

              if (event.event === 'progress') {
                const totalEpisodes = depth === 'quick' ? 80 : 400
                const progress = Math.round((event.episode / totalEpisodes) * 100)
                setScenarios(current => current.map(s =>
                  s.scenario_id === scenarioId
                    ? { ...s, progress, current_episode: event.episode, total_episodes: totalEpisodes, live_reward: event.reward }
                    : s
                ))
              } else if (event.event === 'done') {
                const result = event.result
                setScenarios(current => current.map(s =>
                  s.scenario_id === scenarioId
                    ? {
                        ...s,
                        status: 'done',
                        progress: 100,
                        kpi: result.kpi,
                        sim_config_summary: result.sim_config_summary,
                      }
                    : s
                ))
              } else if (event.event === 'error') {
                setScenarios(current => current.map(s =>
                  s.scenario_id === scenarioId
                    ? { ...s, status: 'error', error: event.message }
                    : s
                ))
              }
            } catch {}
          }
          processChunk()
        })
      }
      processChunk()
    }).catch(err => {
      setScenarios(current => current.map(s =>
        s.scenario_id === scenarioId
          ? { ...s, status: 'error', error: String(err) }
          : s
      ))
    })
  }, [scenarios, intersection, selectedModelSingle])

  // ── Show Simulation Handler ──
  const handleShowSim = useCallback((scenario: Scenario, forceStartRun = false) => {
    const store = useSimulationStore.getState()
    const visualSessionId = `road_opt_visual_${scenario.scenario_id}`

    // If we just want to view a completed run, do not restart it on the backend.
    if (!forceStartRun && scenario.status === 'done') {
      setSessionId(visualSessionId)
      setActiveSimScenario(scenario)
      setActiveSimConfig(getScenarioSimConfig(scenario, simConfig, intersection))
      
      const targetModel = scenario.evaluation_model || (scenario.scenario_type === 'baseline' ? 'baseline_fixed' : 'rl1')
      let finalFrame = store.baselineFrame
      if (targetModel === 'rl1') finalFrame = store.rl1Frame
      else if (targetModel === 'rl2') finalFrame = store.rl2Frame
      else if (targetModel === 'rl3') finalFrame = store.rl3Frame
      else if (targetModel === 'rl4') finalFrame = store.rl4Frame
      else if (targetModel === 'custom') finalFrame = store.customFrame

      if (finalFrame) {
        useSimulationStore.setState({ currentFrame: finalFrame, simTimeS: finalFrame.sim_time_s })
      }
      setRunning(false)
      setPaused(false)
      return
    }

    // Stop any previous session so the backend kills its thread cleanly.
    const prevSid = store.sessionId
    if (prevSid) {
      emit('sim:stop', { session_id: prevSid })
    }

    // Reset all simulation state so the canvas starts completely empty.
    store.resetSimulation()
    clearFrames()

    setSessionId(visualSessionId)
    setRunning(true)
    setPaused(false)
    setSimSpeed(5) // Default to 5x speed
    setActiveSimScenario(scenario)

    const liveScen = scenarios.find(s => s.scenario_id === scenario.scenario_id) || scenario
    const isCurrentlyRunning = liveScen.status === 'running'
    if (forceStartRun && !isCurrentlyRunning) {
      setRunQueue([])
      handleRun(scenario.scenario_id)
    }

    const mutatedSimConfig = getScenarioSimConfig(scenario, simConfig, intersection)
    const targetModel = scenario.evaluation_model || (scenario.scenario_type === 'baseline' ? 'baseline_fixed' : 'rl1')

    // Store the mutated config so SimCanvas renders correct geometry for this scenario
    setActiveSimConfig(mutatedSimConfig)

    // Wait for the old backend thread to wind down before starting the new session.
    // 250ms is enough for the thread to see running=False on its next tick (max ~40ms sleep).
    const startDelay = prevSid ? 250 : 0
    setTimeout(() => {
      emit('sim:start', {
        session_id: visualSessionId,
        model_key: targetModel,
        sim_config: mutatedSimConfig,
        adverse_config: adverseConfig,
      })

      emit('sim:speed', {
        session_id: visualSessionId,
        multiplier: 5,
      })
    }, startDelay)
  }, [emit, selectedModelSingle, intersection, simConfig, adverseConfig, setSessionId, setSelectedModelSingle, setRunning, setPaused, handleRun, scenarios, setSimSpeed, clearFrames])

  const handleStopVisualSim = useCallback(() => {
    if (!activeSimScenario) return
    const visualSessionId = `road_opt_visual_${activeSimScenario.scenario_id}`
    emit('sim:stop', { session_id: visualSessionId })
    clearFrames()
    setSessionId(null)
    setRunning(false)
    setPaused(false)
    setActiveSimScenario(null)
    setActiveSimConfig(null)
  }, [activeSimScenario, emit, clearFrames, setSessionId, setRunning, setPaused])

  const handleCloseVisualSim = useCallback(() => {
    setActiveSimScenario(null)
    setActiveSimConfig(null)
  }, [])



  // ── Sync live sim results → scenario KPI cards ──────────────────────────
  // When a visual simulation run completes, the live particle sim has real
  // measured values (avg_wait_s, throughput_vph) that may differ from the
  // analytical mock-env estimates. Overwrite the card KPI with real figures
  // so the card and the live stats panel always agree.
  useEffect(() => {
    const handler = (data?: { session_id?: string; completed?: boolean }) => {
      if (!data?.completed || !data.session_id) return
      const sid = data.session_id
      if (!sid.startsWith('road_opt_visual_')) return

      // Derive the scenario_id from the session_id
      const scenId = sid.replace('road_opt_visual_', '')

      // Grab the last frame's aggregate stats from the sim store
      const frame = useSimulationStore.getState().currentFrame as any
      const stats = frame?.stats
      if (!stats) return

      const liveWait = typeof stats.avg_wait_s === 'number' ? stats.avg_wait_s : null
      const liveTput = typeof stats.throughput_vph === 'number' ? stats.throughput_vph : null

      if (liveWait === null && liveTput === null) return

      setScenarios(prev => prev.map(s => {
        if (s.scenario_id !== scenId) return s
        if (s.status !== 'done' || !s.kpi) return s
        // Compute flow efficiency from live throughput vs configured demand
        const configuredVph = intersection.traffic_volume_vph || 1
        const liveFlowEff = liveTput !== null
          ? Math.round(Math.min(1.0, liveTput / configuredVph) * 1000) / 1000
          : s.kpi.flow_efficiency
        return {
          ...s,
          kpi: {
            ...s.kpi,
            avg_wait_s: liveWait !== null ? Math.round(liveWait * 10) / 10 : s.kpi.avg_wait_s,
            throughput_vph: liveTput !== null ? Math.round(liveTput) : s.kpi.throughput_vph,
            flow_efficiency: liveFlowEff,
          }
        }
      }))
    }

    socket.on('sim:stopped', handler)
    return () => { socket.off('sim:stopped', handler) }
  }, [socket, intersection.traffic_volume_vph])

  // ── Add scenario ──
  const handleAdd = useCallback((s: Omit<Scenario, 'status' | 'progress' | 'current_episode' | 'total_episodes' | 'live_reward' | 'kpi' | 'error'>) => {
    setScenarios(prev => [...prev, {
      ...s,
      evaluation_model: 'baseline_fixed',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: s.training_depth === 'quick' ? 80 : 400,
      live_reward: 0,
      kpi: null,
      error: null,
    }])
  }, [])

  // ── Remove scenario ──
  const handleRemove = useCallback((id: string) => {
    setScenarios(prev => prev.filter(s => s.scenario_id !== id))
    setRunQueue(prev => prev.filter(qid => qid !== id))
  }, [])

  // ── Model change per scenario level ──
  const handleModelChange = useCallback((scenarioId: string, model: string) => {
    setScenarios(prev => prev.map(s => {
      if (s.scenario_id === scenarioId) {
        return { ...s, evaluation_model: model }
      }
      return s
    }))
  }, [])

  // ── Inject Demo Suite ──
  const handleInjectDemo = useCallback(() => {
    const demoIdSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`
    const demoScenarios = [
      {
        scenario_id: `scen_demo_left_${demoIdSuffix}`,
        label: 'Free Left Turn Scheme',
        scenario_type: 'free_left',
        training_depth: 'quick' as const,
        evaluation_model: 'baseline_fixed',
        status: 'idle' as const,
        progress: 0,
        current_episode: 0,
        total_episodes: 80,
        live_reward: 0,
        kpi: null,
        error: null,
        sim_config_summary: {},
      },
      {
        scenario_id: `scen_demo_uturn_${demoIdSuffix}`,
        label: 'Mid-Block U-Turn Bypass',
        scenario_type: 'u_turn_mid',
        training_depth: 'quick' as const,
        evaluation_model: 'baseline_fixed',
        status: 'idle' as const,
        progress: 0,
        current_episode: 0,
        total_episodes: 80,
        live_reward: 0,
        kpi: null,
        error: null,
        sim_config_summary: {},
      }
    ]
    setScenarios(prev => {
      // Retain only baseline, append new demo scenarios
      const baseline = prev.filter(s => s.scenario_type === 'baseline')
      return [...baseline, ...demoScenarios]
    })
  }, [])



  // ── Run All Scenarios (Sequential Queue) ──
  const handleRunAll = useCallback(() => {
    // Filter scenarios that are not currently running
    const runList = scenarios
      .filter(s => s.status !== 'running')
      .map(s => s.scenario_id)
    if (runList.length > 0) {
      setRunQueue(runList)
    }
  }, [scenarios])

  // ── Done Config (Step 1 -> 2) ──
  const handleDoneConfig = useCallback(() => {
    setMaxUnlockedStep(prev => Math.max(prev, 2))
    setActiveStep(2)
    setActiveTab('scenarios')
  }, [])

  // ── Done Adding Scenarios ──
  const handleDoneAdding = useCallback(() => {
    setMaxUnlockedStep(prev => Math.max(prev, 3))
    setActiveStep(3)
  }, [])

  // ── Done Running Simulations (Step 3 -> 4) ──
  const handleDoneSimulations = useCallback(() => {
    setMaxUnlockedStep(prev => Math.max(prev, 4))
    setActiveStep(4)
    setActiveTab('results')
  }, [])

  // ── Done Contrast Metrics (Step 4 -> 5) ──
  const handleDoneResults = useCallback(() => {
    setMaxUnlockedStep(prev => Math.max(prev, 5))
    setActiveStep(5)
    setActiveTab('report')
  }, [])

  // ── Reset Pipeline Handler ──
  const handleResetPipeline = useCallback(() => {
    // Stop the active visual simulation explicitly
    if (activeSimScenario) {
      const visualSessionId = `road_opt_visual_${activeSimScenario.scenario_id}`
      emit('sim:stop', { session_id: visualSessionId })
      clearFrames()
    }
    // Stop any running card simulations
    scenarios.forEach(s => {
      emit('sim:stop', { session_id: `road_opt_visual_${s.scenario_id}` })
    })

    // Reset Zustand stores
    useConfigStore.getState().resetToDefaults()
    useSimulationStore.getState().setSelectedModelSingle('baseline_fixed')

    // Reload the page completely for a fresh start like reload
    window.location.reload()
  }, [activeSimScenario, scenarios, emit, clearFrames])

  // E2E Automated Demo Sequence removed

  // Sync global store configuration to local state
  const syncStoreToState = useCallback(() => {
    const { simConfig, activePreset } = useConfigStore.getState()
    
    const type = simConfig.intersection_type || 'four_way'
    let arms = 4
    if (type.startsWith('t_junction')) {
      arms = 3
    } else if (type.startsWith('six_arm') || type.startsWith('6arm') || type.startsWith('6_arm')) {
      arms = 6
    }
    
    setIntersection({
      id: type,
      name: activePreset?.name || 'HITEC City Signal',
      arms: arms,
      lanes_per_arm: simConfig.n_lanes ?? 3,
      traffic_volume_vph: simConfig.total_vph ?? 3000,
      vehicle_mix: (simConfig.vehicle_mix as string) ?? 'hyderabad_mixed',
      traffic_pattern: simConfig.traffic_pattern ?? 'uniform',
    })
  }, [])

  // Sync on mount & config changes
  useEffect(() => {
    syncStoreToState()
  }, [syncStoreToState, simConfig, activePreset])

  // Update scenarios suite when activePreset changes
  useEffect(() => {
    // Only load baseline by default, showing no modifiers
    const baseline: Scenario = {
      scenario_id: 'baseline',
      label: 'Baseline (Current State)',
      scenario_type: 'baseline',
      training_depth: 'quick',
      evaluation_model: 'baseline_fixed',
      status: 'idle',
      progress: 0,
      current_episode: 0,
      total_episodes: 80,
      live_reward: 0,
      kpi: null,
      error: null,
      sim_config_summary: {},
    };
    setScenarios([baseline])
  }, [activePreset?.id])

  const handleConfigClose = () => {
    setIsConfigOpen(false)
    syncStoreToState()
  }

  const handleConfigApply = () => {
    syncStoreToState()
  }

  const handleStepClick = useCallback((stepNum: number) => {
    setActiveStep(stepNum)
    if (stepNum === 1) {
      setActiveTab('config')
    } else {
      if (stepNum === 2 || stepNum === 3) {
        setActiveTab('scenarios')
      } else if (stepNum === 4) {
        setActiveTab('results')
      } else if (stepNum === 5) {
        setActiveTab('report')
      }
    }
  }, [])

  // Queue runner logic
  useEffect(() => {
    if (runQueue.length === 0) {
      return
    }

    const anyRunning = scenarios.some(s => s.status === 'running')
    if (!anyRunning) {
      const nextId = runQueue[0]
      setRunQueue(prev => prev.slice(1))
      handleRun(nextId)
      setActiveStep(3)
    }
  }, [runQueue, scenarios, handleRun])

  return (
    <div className="ro-page">
      {/* Top Bar */}
      <div className="ro-topbar">
        <div className="ro-topbar-brand">
          <div className="ro-topbar-brand-dot" />
          Road Optimizer
        </div>
        <div className="ro-topbar-sep" />
        <div className="ro-topbar-subtitle">Scenario Lab — Test road modifications, compare outcomes, get AI recommendations</div>
        <div style={{ flex: 1 }} />
        
        {/* E2E Demo trigger removed */}
      </div>

      {/* Dynamic Guided Steps */}
      <div className="ro-guide-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div className="ro-guide-title" style={{ marginBottom: 4 }}>
              Optimization Pipeline Stepper
            </div>
            <div className="ro-guide-subtitle" style={{ margin: 0 }}>
              Follow this interactive pipeline to evaluate modifications, run simulations, and unlock traffic planning recommendations.
            </div>
          </div>
          <button
            className="ro-btn ro-btn-danger"
            onClick={handleResetPipeline}
            style={{ fontSize: 12, height: 'fit-content', padding: '6px 12px' }}
          >
            Reset Pipeline
          </button>
        </div>
        <div className="ro-guide-steps">
          {[
            {
              step: 1,
              title: "1. Configure Base",
              desc: "Configure intersection geometry, lanes, demand, and risk parameters in the popup."
            },
            {
              step: 2,
              title: "2. Add Modifiers",
              desc: "Add free left turns, mid-block bays, signal phases, or crossings to evaluate."
            },
            {
              step: 3,
              title: "3. Run Simulations",
              desc: "Run simulation on each scenario sequentially or all at once to evaluate performance."
            },
            {
              step: 4,
              title: "4. Contrast Metrics",
              desc: "Review wait delays, throughput margins, and flow efficiency gains."
            },
            {
              step: 5,
              title: "5. AI Recommendation",
              desc: "Generate engineering recommendations, cost-benefit trade-offs, and ratings."
            }
          ].map(s => {
            const isActive = activeStep === s.step
            const isCompleted = s.step < maxUnlockedStep
            const isClickable = s.step <= maxUnlockedStep
            // Step 5 gets a special tick when the AI report has been fetched
            const isAiDone = s.step === 5 && aiRecommendationDone
            const cardClass = `ro-guide-step-card ${isActive ? 'active' : ''} ${isCompleted || isAiDone ? 'completed' : ''}`
            return (
              <button
                key={s.step}
                type="button"
                className={cardClass}
                onClick={() => handleStepClick(s.step)}
                disabled={!isClickable}
              >
                <div className="ro-guide-step-num">STEP 0{s.step} {(isCompleted || isAiDone) ? '✓' : ''}</div>
                <div className="ro-guide-step-title">{s.title}</div>
                <div className="ro-guide-step-desc">{s.desc}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main layout */}
      <div className="ro-layout" style={{ gridTemplateColumns: doneCount > 0 ? '340px 1fr' : '1fr' }}>
        {/* Sidebar — visible only when session summary stats are available */}
        {doneCount > 0 && (
          <div className="ro-sidebar">
            {/* Quick stats */}
            <div className="ro-card">
              <div className="ro-card-title">Session Summary</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
                  <span>Scenarios defined</span>
                  <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{scenarios.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
                  <span>Completed</span>
                  <span style={{ color: '#34d399', fontWeight: 600 }}>{displayDoneCount}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
                  <span>Queue Remaining</span>
                  <span style={{ color: '#6366f1', fontWeight: 600 }}>{runQueue.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
                  <span>Running</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>
                    {displayRunningCount}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, marginTop: 4 }}>
                  <span>AI Recommendation</span>
                  <span style={{ fontWeight: 700, color: aiRecommendationDone ? '#34d399' : '#475569' }}>
                    {aiRecommendationDone ? '✓ Done' : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main content area */}
        <div className="ro-main">
          {activeTab === 'config' && (
            <div className="ro-config-area animate-fadeIn">
              <div className="ro-config-dashboard-header">
                <div className="ro-config-header-left">
                  <div className="ro-section-header">
                    Base Simulation Configuration
                    {activePreset && (
                      <span className="ro-section-chip" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', marginLeft: 12 }}>
                        Preset: {activePreset.name}
                      </span>
                    )}
                  </div>
                  <p className="ro-config-header-desc" style={{ maxWidth: 'none' }}>
                    Calibrate intersection geometries, traffic demand patterns, vehicle mix, signal schedules, and environmental risk models.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>

                  <button
                    className="ro-btn ro-btn-primary"
                    onClick={() => setIsConfigOpen(true)}
                    style={{ fontSize: 12, height: 'fit-content' }}
                  >
                    Configure Base Settings
                  </button>
                  {activeStep === 1 && (
                    <button
                      id="ro-done-config-trigger"
                      className="ro-btn ro-btn-primary animate-fadeIn"
                      onClick={handleDoneConfig}
                      style={{
                        fontSize: 12,
                        height: 'fit-content',
                        background: 'rgba(16, 185, 129, 0.1)',
                        borderColor: 'rgba(16, 185, 129, 0.35)',
                        color: '#34d399',
                        border: '1px solid rgba(16, 185, 129, 0.3)'
                      }}
                    >
                      Done
                    </button>
                  )}
                </div>
              </div>

              <div className="ro-config-grid">
                {/* Intersection Geometry Card */}
                <div className="ro-config-card">
                  <div className="ro-config-card-title">Intersection Geometry</div>
                  <div className="ro-config-rows">
                    <div className="ro-config-row">
                      <span className="ro-config-label">Junction Type</span>
                      <span className="ro-config-value">{simConfig.intersection_type ? simConfig.intersection_type.replace(/_/g, ' ').toUpperCase() : 'FOUR WAY'}</span>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">Arms Count</span>
                      <span className="ro-config-value">{intersection.arms} Arms</span>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">Lanes per Arm</span>
                      <span className="ro-config-value">{intersection.lanes_per_arm} Lanes</span>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">Baseline Controller</span>
                      <span className="ro-config-value">{simConfig.baseline_controller === 'websters' ? 'Webster Adaptive' : 'Fixed-Time Pre-Timed'}</span>
                    </div>
                  </div>
                </div>

                {/* Demand & Pattern Card */}
                <div className="ro-config-card">
                  <div className="ro-config-card-title">Traffic Volume & Pattern</div>
                  <div className="ro-config-rows">
                    <div className="ro-config-row">
                      <span className="ro-config-label">Target Volume</span>
                      <span className="ro-config-value">{intersection.traffic_volume_vph.toLocaleString()} VPH</span>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">Volume Level</span>
                      <div className="ro-config-progress-wrapper">
                        <div className="ro-config-progress-bar">
                          <div
                            className="ro-config-progress-fill bg-emerald-500"
                            style={{ width: `${Math.min(100, (intersection.traffic_volume_vph / 15000) * 100)}%` }}
                          />
                        </div>
                        <span className="ro-config-progress-text">
                          {intersection.traffic_volume_vph < 5000 ? 'Light' : intersection.traffic_volume_vph < 12000 ? 'Medium' : 'Severe Peak'}
                        </span>
                      </div>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">Traffic Pattern</span>
                      <span className="ro-config-value" style={{ textTransform: 'capitalize' }}>
                        {intersection.traffic_pattern.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">Arrival Model</span>
                      <span className="ro-config-value" style={{ textTransform: 'capitalize' }}>
                        {(simConfig.arrival_distribution as string) || 'Poisson Process'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Signal Timing Specs Card */}
                <div className="ro-config-card">
                  <div className="ro-config-card-title">Signal Timing Splits</div>
                  <div className="ro-config-rows">
                    <div className="ro-config-row">
                      <span className="ro-config-label">Cycle Length</span>
                      <span className="ro-config-value">{simConfig.cycle_length_s || 120} Seconds</span>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">Active Phases</span>
                      <span className="ro-config-value">{simConfig.n_phases || 4} Phase Scheme</span>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">Min / Max Green</span>
                      <span className="ro-config-value">
                        {simConfig.phase_min_green_s || 15}s / {simConfig.phase_max_green_s || 120}s
                      </span>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">Transition (Yellow / Red)</span>
                      <span className="ro-config-value">
                        {simConfig.yellow_time_s || 4}s Amber / {simConfig.all_red_time_s || 2}s All-Red
                      </span>
                    </div>
                  </div>
                </div>



                {/* Adverse Risk Model Card */}
                <div className="ro-config-card">
                  <div className="ro-config-card-title">Adverse Risk Model</div>
                  <div className="ro-config-rows">
                    <div className="ro-config-row">
                      <span className="ro-config-label">Waterlogging Scenario</span>
                      <span className={`ro-config-badge ${adverseConfig.waterlogging_enabled ? 'active' : 'inactive'}`}>
                        {adverseConfig.waterlogging_enabled ? `Active (Severity ${Math.round((adverseConfig.waterlogging_severity ?? 0.5) * 100)}%)` : 'Inactive'}
                      </span>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">VIP Convoy Intrusion</span>
                      <span className={`ro-config-badge ${adverseConfig.vip_convoy_enabled ? 'active' : 'inactive'}`}>
                        {adverseConfig.vip_convoy_enabled ? 'Active (Priority Override)' : 'Inactive'}
                      </span>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">Signal Controller Failure</span>
                      <span className={`ro-config-badge ${(adverseConfig.signal_failure_prob ?? 0) > 0 ? 'active' : 'inactive'}`}>
                        {(adverseConfig.signal_failure_prob ?? 0) > 0 ? `Active (${Math.round((adverseConfig.signal_failure_prob ?? 0) * 100)}% Prob, Stuck ${adverseConfig.signal_failure_mode || 'Red'})` : 'Inactive'}
                      </span>
                    </div>
                    <div className="ro-config-row">
                      <span className="ro-config-label">Camera Feed Dropouts</span>
                      <span className={`ro-config-badge ${(adverseConfig.camera_dropout_prob ?? 0) > 0 ? 'active' : 'inactive'}`}>
                        {(adverseConfig.camera_dropout_prob ?? 0) > 0 ? `Active (${Math.round((adverseConfig.camera_dropout_prob ?? 0) * 100)}% Prob)` : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Vehicle Mix Distribution Card (Full Width Span) */}
                <div className="ro-config-card ro-config-card-full">
                  <div className="ro-config-card-title">Calibrated Fleet Vehicle Mix</div>
                  <div className="ro-config-vehicle-mix-grid">
                    {[
                      { name: 'Cars', val: simConfig.pct_car ?? 35 },
                      { name: 'Two-Wheelers', val: simConfig.pct_two_wheeler ?? 40 },
                      { name: 'EV Scooters', val: simConfig.pct_ev_scooter ?? 5 },
                      { name: 'Auto Rickshaws', val: simConfig.pct_auto_rickshaw ?? 10 },
                      { name: 'E-Rickshaws', val: simConfig.pct_e_rickshaw ?? 2 },
                      { name: 'Cabs', val: simConfig.pct_cab ?? 5 },
                      { name: 'Delivery Bikes', val: simConfig.pct_delivery_bike ?? 3 },
                      { name: 'TSRTC Buses', val: simConfig.pct_tsrtc_bus ?? 2 },
                      { name: 'School Buses', val: simConfig.pct_school_bus ?? 1 },
                      { name: 'Trucks', val: simConfig.pct_truck ?? 1 },
                    ].map((mix, idx) => (
                      <div className="ro-mix-item" key={idx}>
                        <div className="ro-mix-item-header">
                          <span className="ro-mix-item-name">{mix.name}</span>
                          <span className="ro-mix-item-val font-mono">{mix.val}%</span>
                        </div>
                        <div className="ro-mix-item-bar-bg">
                          <div className="ro-mix-item-bar-fill bg-indigo-500" style={{ width: `${mix.val}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'scenarios' && (
            <ScenarioBoard
              scenarios={scenarios}
              intersection={intersection}
              activeStep={activeStep}
              onDone={handleDoneAdding}
              onDoneSimulations={handleDoneSimulations}
              onAdd={handleAdd}
              onRun={(id) => {
                const scenario = scenarios.find(s => s.scenario_id === id)
                if (scenario) {
                  handleShowSim(scenario, true)
                }
              }}
              onRemove={handleRemove}
              onRunAll={handleRunAll}
              isBulkRunning={isBulkRunning}
              queueLength={runQueue.length}
              onInjectDemo={handleInjectDemo}
              onShowSim={handleShowSim}
              isAnyVisualSimRunning={isAnyVisualSimRunning}
              visuallyRunningScenarioId={visuallyRunningScenarioId}
              availableModelKeys={availableModelKeys}
              onModelChange={handleModelChange}
            />
          )}
          {activeTab === 'results' && (
            <ResultsPanel
              scenarios={scenarios}
              onDone={handleDoneResults}
            />
          )}
          {activeTab === 'report' && (
            <LLMReportPanel
              scenarios={scenarios}
              intersectionName={intersection.name}
              persistedReport={aiReport}
              onReportFetched={(r) => {
                setAiReport(r)
                setAiRecommendationDone(true)
              }}
            />
          )}
        </div>
      </div>
      <ConfigModal
        open={isConfigOpen}
        mode="simulation"
        onClose={handleConfigClose}
        onApply={handleConfigApply}
        isBaselineView={true}
      />

      {/* Visual Simulation Popup Modal Overlay */}
      {activeSimScenario && (() => {
        const currentSimScenario = scenarios.find(s => s.scenario_id === activeSimScenario.scenario_id) || activeSimScenario
        return (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-fadeIn"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={handleCloseVisualSim}
          >
            <div
              className="relative flex flex-col w-full rounded-2xl overflow-hidden"
              style={{
                maxWidth: 1340,
                maxHeight: '100%',
                background: '#07090d',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.85)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-black/20">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
                    Visual Simulation & Telemetry Studio
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Active Scenario: <span className="text-[#8fb8ce] font-semibold">{currentSimScenario.label}</span> ({(currentSimScenario.evaluation_model || (currentSimScenario.scenario_type === 'baseline' ? 'baseline_fixed' : 'rl1')).toUpperCase()} model)
                  </p>
                  {currentSimScenario?.status === 'running' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                      <div className="ro-spinner" style={{ width: 10, height: 10 }} />
                      <span className="text-[11px] font-mono text-emerald-400">
                        Simulating... {currentSimScenario.progress}% (Episode {currentSimScenario.current_episode}/{currentSimScenario.total_episodes})
                      </span>
                      <div style={{ width: 100, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 1.5, overflow: 'hidden' }}>
                        <div style={{ width: `${currentSimScenario.progress}%`, height: '100%', background: '#10b981' }} />
                      </div>
                    </div>
                  )}
                  {currentSimScenario?.status === 'done' && (() => {
                    const maxDur = Number(simConfig.simulation_duration_s ?? 1800)
                    const isFinished = simTimeS >= maxDur || (!isRunning && simTimeS > 0)
                    
                    if (isPaused) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <span style={{ color: '#fbbf24', fontSize: 11 }}>⏸</span>
                          <span className="text-[11px] font-mono text-amber-400 font-semibold">Simulation Paused</span>
                        </div>
                      )
                    }
                    
                    if (isRunning && !isFinished) {
                      const visualProgress = Math.min(100, Math.round((simTimeS / maxDur) * 100))
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                          <div className="ro-spinner" style={{ width: 10, height: 10 }} />
                          <span className="text-[11px] font-mono text-emerald-400">
                            Simulation In Progress... {visualProgress}%
                          </span>
                          <div style={{ width: 100, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 1.5, overflow: 'hidden' }}>
                            <div style={{ width: `${visualProgress}%`, height: '100%', background: '#10b981' }} />
                          </div>
                        </div>
                      )
                    }
                    
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span style={{ color: '#10b981', fontSize: 11 }}>✓</span>
                        <span className="text-[11px] font-mono text-emerald-400 font-semibold">Simulation Complete</span>
                      </div>
                    )
                  })()}
                </div>
                <button
                  onClick={handleCloseVisualSim}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-all text-xl border border-transparent hover:border-white/[0.08]"
                >
                  &times;
                </button>
              </div>

              {/* Modal Body (Simulation Studio Canvas + Metrics Panel) */}
              <div className="p-6 flex flex-col xl:flex-row gap-6 items-center xl:items-start justify-center bg-black/10 overflow-auto flex-1 min-h-0">
                <div style={{ width: 720, height: 560, flexShrink: 0 }} className="relative bg-black/40 rounded-xl overflow-hidden border border-white/[0.04]">
                  <SimCanvas
                    width={720}
                    height={560}
                    showTrails={true}
                    label={`${currentSimScenario.label} — ${(currentSimScenario.evaluation_model || (currentSimScenario.scenario_type === 'baseline' ? 'baseline_fixed' : 'rl1')).toUpperCase()}`}
                    isRunning={isRunning}
                    isPaused={isPaused}
                    speedValue={simSpeed}
                    simConfigOverride={activeSimConfig}
                    onSpeedChange={(s) => {
                      setSimSpeed(s)
                      emit('sim:speed', { session_id: `road_opt_visual_${currentSimScenario.scenario_id}`, multiplier: s })
                    }}
                    onPlayPause={() => {
                      const targetPause = !isPaused
                      setPaused(targetPause)
                      emit(targetPause ? 'sim:pause' : 'sim:resume', { session_id: `road_opt_visual_${currentSimScenario.scenario_id}` })
                    }}
                    onStop={handleStopVisualSim}
                    responsive={false}
                  />
                </div>
                
                <div style={{ width: 560, height: 560, flexShrink: 0 }}>
                  <SimLiveStatsPanel modelKey={currentSimScenario.evaluation_model || (currentSimScenario.scenario_type === 'baseline' ? 'baseline_fixed' : 'rl1')} />
                </div>
              </div>
              
              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-white/[0.06] flex items-center justify-between bg-[#040508] text-[10.5px] text-slate-500 font-mono">
                <span>
                  Junction Type:{' '}
                  {typeof currentSimScenario?.sim_config_summary?.intersection_type === 'string'
                    ? currentSimScenario.sim_config_summary.intersection_type.replace(/_/g, ' ').toUpperCase()
                    : 'DYNAMIC'}
                </span>
                <span>Simulation & Telemetry Studio — Close to return to scenarios board</span>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
