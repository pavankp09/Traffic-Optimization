import { useCallback, useRef } from 'react'
import { useSocket } from './useSocket'
import { useSimulationStore } from '../store/simulationStore'
import { useConfigStore } from '../store/configStore'
import type { Preset } from '../types'

export interface DemoStep {
  action: string
  delay_ms: number
  description: string
}

const DEMO_STEPS: DemoStep[] = [
  { action: 'load_preset',     delay_ms: 500,   description: 'Loading Hyderabad Rush Hour preset...' },
  { action: 'start_sim',       delay_ms: 1000,  description: 'Starting simulation...' },
  { action: 'wait',            delay_ms: 10000, description: 'Observing baseline traffic flow...' },
  { action: 'start_training',  delay_ms: 500,   description: 'Starting RL training...' },
  { action: 'wait',            delay_ms: 20000, description: 'Training in progress...' },
  { action: 'split_screen',    delay_ms: 500,   description: 'Enabling split-screen comparison...' },
  { action: 'wait',            delay_ms: 15000, description: 'Comparing before/after...' },
  { action: 'show_metrics',    delay_ms: 500,   description: 'Displaying results...' },
  { action: 'done',            delay_ms: 0,     description: 'Demo complete!' },
]

interface QuickDemoState {
  isRunning: boolean
  currentStep: number
  currentDescription: string
  progress: number   // 0-100
}

export function useQuickDemo() {
  const { emit } = useSocket()
  const setViewMode = useSimulationStore((s) => s.setViewMode)
  const loadPreset = useConfigStore((s) => s.loadPreset)

  const stateRef = useRef<QuickDemoState>({
    isRunning: false,
    currentStep: 0,
    currentDescription: '',
    progress: 0,
  })
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const onStepCallbackRef = useRef<((state: QuickDemoState) => void) | null>(null)

  const updateState = useCallback((updates: Partial<QuickDemoState>) => {
    stateRef.current = { ...stateRef.current, ...updates }
    onStepCallbackRef.current?.(stateRef.current)
  }, [])

  const cancelDemo = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    updateState({ isRunning: false, currentStep: 0, progress: 0 })
    setViewMode('single')
  }, [setViewMode, updateState])

  const startDemo = useCallback(
    (onStep?: (state: QuickDemoState) => void) => {
      if (stateRef.current.isRunning) return
      onStepCallbackRef.current = onStep ?? null

      updateState({ isRunning: true, currentStep: 0, progress: 0 })

      let accumulatedDelay = 0
      DEMO_STEPS.forEach((step, idx) => {
        accumulatedDelay += step.delay_ms
        const t = setTimeout(() => {
          const progress = Math.round(((idx + 1) / DEMO_STEPS.length) * 100)
          updateState({ currentStep: idx, currentDescription: step.description, progress })

          switch (step.action) {
            case 'load_preset':
              emit('preset:load', { preset_id: 'hyd_rush_am' })
              break
            case 'start_sim': {
              const sid = `demo_${Date.now()}`
              emit('sim:start', { session_id: sid, sim_config: {}, adverse_config: {} })
              break
            }
            case 'start_training':
              emit('training:start', { session_id: stateRef.current.currentDescription, total_timesteps: 5000 })
              break
            case 'split_screen':
              setViewMode('split')
              break
            case 'done':
              updateState({ isRunning: false, progress: 100 })
              break
          }
        }, accumulatedDelay)
        timeoutsRef.current.push(t)
      })
    },
    [emit, setViewMode, updateState]
  )

  return {
    startDemo,
    cancelDemo,
    demoSteps: DEMO_STEPS,
    getState: () => stateRef.current,
  }
}
