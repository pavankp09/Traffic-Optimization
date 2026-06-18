import { useCallback } from 'react'
import { useSocket } from './useSocket'
import { useSimulationStore } from '../store/simulationStore'
import { useSessionStore } from '../store/sessionStore'
import { useConfigStore } from '../store/configStore'
import type { TrainingMode } from '../components/TrainingModeSelector'

export function useSimulation() {
  const { emit } = useSocket()

  const { sessionId, resetSimulation, setPaused, setSessionId, setSimSpeed } = useSimulationStore()
  const { setTraining, resetSession, setActiveSession, setConverged, setTrainingPaused, setTrainingModelKey, setTrainingMode } = useSessionStore()
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
      const viewMode = useSimulationStore.getState().viewMode

      if (viewMode === 'split') {
        const resetSplitSimulation = useSimulationStore.getState().resetSplitSimulation
        const clearSplitFrames = useSimulationStore.getState().clearSplitFrames
        const setSplitSessionId = useSimulationStore.getState().setSplitSessionId
        const setSplitSimSpeed = useSimulationStore.getState().setSplitSimSpeed

        resetSplitSimulation()
        clearSplitFrames()

        const sid = sessionIdOverride ?? `session_split_${Date.now()}`
        setSplitSessionId(sid)

        const START_SPEED = 5
        setSplitSimSpeed(START_SPEED)

        const currentSimConfig = useConfigStore.getState().simConfig
        const currentAdverseConfig = useConfigStore.getState().adverseConfig
        const runtimeSimConfig = {
          ...currentSimConfig,
          simulation_duration_s: durationSeconds ?? currentSimConfig.simulation_duration_s ?? 1800,
          sim_speed_multiplier: START_SPEED,
        }

        emit('sim:start', {
          session_id: sid,
          model_key: 'all',
          sim_config: runtimeSimConfig,
          adverse_config: currentAdverseConfig,
        })
      } else {
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

        const currentSimConfig = useConfigStore.getState().simConfig
        const currentAdverseConfig = useConfigStore.getState().adverseConfig
        const mergedConfig = getMergedConfig(currentSimConfig, modelKey)
        const runtimeSimConfig = {
          ...mergedConfig,
          simulation_duration_s: durationSeconds ?? mergedConfig.simulation_duration_s ?? 1800,
          sim_speed_multiplier: START_SPEED,
        }
        emit('sim:start', {
          session_id: sid,
          model_key: modelKey,
          sim_config: runtimeSimConfig,
          adverse_config: currentAdverseConfig,
        })

        // When Baseline tab simulation starts, also trigger baseline computation
        // so RL training can reuse the metrics + demonstrations without re-running.
        if (modelKey === 'baseline') {
          emit('baseline:compute', {
            session_id: sid,
            sim_config: runtimeSimConfig,
            adverse_config: currentAdverseConfig,
          })
        }
      }
    },
    [emit, resetSimulation, setSessionId, setActiveSession, setSimSpeed, getMergedConfig]
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

      const currentSimConfig = useConfigStore.getState().simConfig
      const currentAdverseConfig = useConfigStore.getState().adverseConfig
      const mergedConfig = getMergedConfig(currentSimConfig, modelKey)
      const runtimeSimConfig = {
        ...mergedConfig,
        simulation_duration_s: mergedConfig.simulation_duration_s ?? 1800,
        sim_speed_multiplier: START_SPEED,
      }

      emit('sim:start', {
        session_id: sid,
        model_key: modelKey,
        sim_config: runtimeSimConfig,
        adverse_config: currentAdverseConfig,
        replay_episode: episodeNumber,
      })
    },
    [emit, resetSimulation, setSessionId, setActiveSession, setSimSpeed, setTraining, setTrainingPaused, setTrainingModelKey, getMergedConfig]
  )

  const stopSimulation = useCallback(() => {
    const viewMode = useSimulationStore.getState().viewMode
    if (viewMode === 'split') {
      const splitSid = useSimulationStore.getState().splitSessionId
      if (!splitSid) return
      emit('sim:stop', { session_id: splitSid })
      useSimulationStore.getState().resetSplitSimulation()
    } else {
      if (!sessionId) return
      emit('sim:stop', { session_id: sessionId })
      resetSimulation()
    }
  }, [emit, sessionId, resetSimulation])

  const pauseSimulation = useCallback(() => {
    const viewMode = useSimulationStore.getState().viewMode
    if (viewMode === 'split') {
      const splitSid = useSimulationStore.getState().splitSessionId
      if (!splitSid) return
      useSimulationStore.getState().setSplitPaused(true)
      emit('sim:pause', { session_id: splitSid })
    } else {
      if (!sessionId) return
      setPaused(true)
      emit('sim:pause', { session_id: sessionId })
    }
  }, [emit, sessionId, setPaused])

  const resumeSimulation = useCallback(() => {
    const viewMode = useSimulationStore.getState().viewMode
    if (viewMode === 'split') {
      const splitSid = useSimulationStore.getState().splitSessionId
      if (!splitSid) return
      useSimulationStore.getState().setSplitPaused(false)
      emit('sim:resume', { session_id: splitSid })
    } else {
      if (!sessionId) return
      setPaused(false)
      emit('sim:resume', { session_id: sessionId })
    }
  }, [emit, sessionId, setPaused])

  const startTraining = useCallback(
    (totalTimesteps = 20_000, trainingMode: TrainingMode = 'stage1') => {
      setTrainingMode(trainingMode)
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

      const currentSimConfig = useConfigStore.getState().simConfig
      const currentAdverseConfig = useConfigStore.getState().adverseConfig
      const mergedConfig = getMergedConfig(currentSimConfig, trainingModel)
      emit('training:start', {
        session_id: sid,
        total_timesteps: totalTimesteps,
        training_mode: trainingMode,
        sim_config: {
          ...mergedConfig,
          simulation_duration_s: 1800,
          sim_speed_multiplier: START_SPEED,
        },
        adverse_config: currentAdverseConfig,
      })
    },
    [emit, setTraining, setConverged, setSessionId, setActiveSession, resetSession, setSimSpeed, resetSimulation, setTrainingPaused, setTrainingModelKey, getMergedConfig]
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
    const viewMode = useSimulationStore.getState().viewMode
    if (viewMode === 'split') {
      const splitSid = useSimulationStore.getState().splitSessionId
      if (!splitSid) return
      useSimulationStore.getState().setSplitSimSpeed(multiplier)
      emit('sim:speed', { session_id: splitSid, multiplier })
    } else {
      const sid = useSimulationStore.getState().sessionId
      if (!sid) return
      useSimulationStore.getState().setSimSpeed(multiplier)
      emit('sim:speed', { session_id: sid, multiplier })
    }
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
