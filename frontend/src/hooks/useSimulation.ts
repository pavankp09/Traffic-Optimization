import { useCallback } from 'react'
import { useSocket } from './useSocket'
import { useSimulationStore } from '../store/simulationStore'
import { useSessionStore } from '../store/sessionStore'
import { useConfigStore } from '../store/configStore'

export function useSimulation() {
  const { emit } = useSocket()

  const { sessionId, resetSimulation, setPaused, setSessionId, setSimSpeed } = useSimulationStore()
  const { setTraining, resetSession, setActiveSession, setConverged, setTrainingPaused, setTrainingModelKey } = useSessionStore()
  const { simConfig, adverseConfig } = useConfigStore()

  const getMergedConfig = useCallback((cfg: typeof simConfig, modelKey: string) => {
    if (modelKey !== 'baseline' && cfg.same_as_baseline) {
      const tabConfigs = useConfigStore.getState().tabConfigs
      const baselineConfig = tabConfigs.baseline
      if (baselineConfig) {
        return {
          ...baselineConfig,
          rl_algorithm: cfg.rl_algorithm,
          total_timesteps: cfg.total_timesteps,
          learning_rate: cfg.learning_rate,
          hidden_layer_size: cfg.hidden_layer_size,
          discount_factor: cfg.discount_factor,
          reward_wt_queue: cfg.reward_wt_queue,
          reward_wt_wait: cfg.reward_wt_wait,
          reward_wt_throughput: cfg.reward_wt_throughput,
          reward_wt_collision: cfg.reward_wt_collision,
          reward_wt_pedestrian: cfg.reward_wt_pedestrian,
          reward_wt_emergency: cfg.reward_wt_emergency,
          reward_wt_switch: cfg.reward_wt_switch,
          same_as_baseline: true,
        }
      }
    }
    return cfg
  }, [])

  const startSimulation = useCallback(
    (sessionIdOverride?: string, durationSeconds?: number) => {
      // Get the active model key so the backend only runs that world
      const modelKey = useSimulationStore.getState().selectedModelSingle

      // Clear baseline results when starting simulation on baseline itself
      if (modelKey === 'baseline') {
        useSimulationStore.getState().clearBaselineResults()
      }

      // For RL models: preserve baseline frames & metrics — only clear RL frames
      // For baseline: do a full reset
      resetSimulation()
      if (modelKey === 'baseline') {
        useSimulationStore.getState().clearFrames()
      } else {
        // Clear only RL frames; keep baseline frame + metrics intact
        useSimulationStore.getState().clearRlFrames()
      }

      const sid = sessionIdOverride ?? `session_${Date.now()}`
      setSessionId(sid)
      setActiveSession(sid)

      const START_SPEED = 5
      setSimSpeed(START_SPEED)

      const viewMode = useSimulationStore.getState().viewMode
      // In split grid both worlds must run → omit model_key (backend defaults to 'all').
      // In single view restrict to the active model so unused worlds don't waste CPU.
      const effectiveModelKey = viewMode === 'split' ? 'all' : modelKey

      const mergedConfig = getMergedConfig(simConfig, modelKey)
      const runtimeSimConfig = {
        ...mergedConfig,
        simulation_duration_s: durationSeconds ?? mergedConfig.simulation_duration_s ?? 1800,
        sim_speed_multiplier: START_SPEED,
      }
      emit('sim:start', {
        session_id: sid,
        model_key: effectiveModelKey,
        sim_config: runtimeSimConfig,
        adverse_config: adverseConfig,
      })

      // When Baseline tab simulation starts, also trigger baseline computation
      // so RL training can reuse the metrics + demonstrations without re-running.
      if (modelKey === 'baseline') {
        emit('baseline:compute', {
          session_id: sid,
          sim_config: runtimeSimConfig,
          adverse_config: adverseConfig,
        })
      }
    },
    [emit, resetSimulation, simConfig, adverseConfig, setSessionId, setActiveSession, setSimSpeed, getMergedConfig]
  )

  const startEpisodeSimulation = useCallback(
    (episodeNumber: number) => {
      const modelKey = useSimulationStore.getState().selectedModelSingle

      // Stop any current simulation / training
      const activeSid = useSimulationStore.getState().sessionId
      if (activeSid) {
        emit('sim:stop', { session_id: activeSid })
      }
      resetSimulation()

      setTraining(false)
      setTrainingPaused(false)
      setTrainingModelKey(null)

      if (modelKey === 'baseline') {
        useSimulationStore.getState().clearFrames()
      } else {
        useSimulationStore.getState().clearRlFrames()
      }

      const sid = activeSid ?? `session_${Date.now()}`
      setSessionId(sid)
      setActiveSession(sid)

      const START_SPEED = 5
      setSimSpeed(START_SPEED)

      const mergedConfig = getMergedConfig(simConfig, modelKey)
      const runtimeSimConfig = {
        ...mergedConfig,
        simulation_duration_s: mergedConfig.simulation_duration_s ?? 1800,
        sim_speed_multiplier: START_SPEED,
      }

      emit('sim:start', {
        session_id: sid,
        model_key: modelKey,
        sim_config: runtimeSimConfig,
        adverse_config: adverseConfig,
        replay_episode: episodeNumber,
      })
    },
    [emit, resetSimulation, simConfig, adverseConfig, setSessionId, setActiveSession, setSimSpeed, setTraining, setTrainingPaused, setTrainingModelKey, getMergedConfig]
  )

  const stopSimulation = useCallback(() => {
    if (!sessionId) return
    emit('sim:stop', { session_id: sessionId })
    resetSimulation()
  }, [emit, sessionId, resetSimulation])

  const pauseSimulation = useCallback(() => {
    if (!sessionId) return
    setPaused(true)
    emit('sim:pause', { session_id: sessionId })
  }, [emit, sessionId, setPaused])

  const resumeSimulation = useCallback(() => {
    if (!sessionId) return
    setPaused(false)
    emit('sim:resume', { session_id: sessionId })
  }, [emit, sessionId, setPaused])

  const startTraining = useCallback(
    (totalTimesteps = 500_000, trainingMode: string = 'stage1') => {
      // Clean reload training curve and metrics first
      resetSession()

      // Ensure any running simulation is stopped before starting training
      const activeSid = useSimulationStore.getState().sessionId
      if (activeSid) {
        emit('sim:stop', { session_id: activeSid })
      }
      useSimulationStore.getState().prepareForTraining()

      const sid = `session_${Date.now()}` // generate fresh session ID for retraining
      setSessionId(sid)
      setActiveSession(sid)

      const START_SPEED = 5
      setSimSpeed(START_SPEED)

      // Record WHICH model is training so the UI shows the training panel only on
      // this tab — other RL tabs stay idle even though training runs in background.
      const trainingModel = useSimulationStore.getState().selectedModelSingle
      setTrainingModelKey(trainingModel)

      setTraining(true)
      setTrainingPaused(false)
      setConverged(false)

      const mergedConfig = getMergedConfig(simConfig, trainingModel)
      emit('training:start', {
        session_id: sid,
        total_timesteps: totalTimesteps,
        training_mode: trainingMode,
        sim_config: {
          ...mergedConfig,
          simulation_duration_s: 1800,
          sim_speed_multiplier: START_SPEED,
        },
        adverse_config: adverseConfig,
      })
    },
    [emit, setTraining, setConverged, simConfig, adverseConfig, setSessionId, setActiveSession, resetSession, setSimSpeed, resetSimulation, setTrainingPaused, setTrainingModelKey, getMergedConfig]
  )


  const stopTraining = useCallback(() => {
    if (!sessionId) return
    setTraining(false)
    setTrainingPaused(false)
    setTrainingModelKey(null)
    emit('training:stop', { session_id: sessionId })
  }, [emit, sessionId, setTraining, setTrainingPaused, setTrainingModelKey])

  const pauseTraining = useCallback(() => {
    if (!sessionId) return
    setTrainingPaused(true)
    emit('training:pause', { session_id: sessionId })
  }, [emit, sessionId, setTrainingPaused])

  const resumeTraining = useCallback(() => {
    if (!sessionId) return
    setTrainingPaused(false)
    emit('training:resume', { session_id: sessionId })
  }, [emit, sessionId, setTrainingPaused])

  const setSpeed = useCallback((multiplier: 1 | 5 | 10 | 20) => {
    // Always read sessionId live from store — avoids stale closure when the
    // callback is created before sessionId is set (React timing edge-case).
    const sid = useSimulationStore.getState().sessionId
    if (!sid) return
    // Optimistic UI update: button highlights immediately, no round-trip needed.
    useSimulationStore.getState().setSimSpeed(multiplier)
    // Tell the backend — the sim loop re-reads sim_speed every tick.
    emit('sim:speed', { session_id: sid, multiplier })
  }, [emit])  // emit is stable (empty deps in useSocket)

  const resetAll = useCallback(() => {
    stopSimulation()
    resetSession()
  }, [stopSimulation, resetSession])

  return {
    startSimulation,
    startEpisodeSimulation,
    stopSimulation,
    pauseSimulation,
    resumeSimulation,
    setSpeed,
    startTraining,
    stopTraining,
    pauseTraining,
    resumeTraining,
    resetAll,
    sessionId,
  }
}
