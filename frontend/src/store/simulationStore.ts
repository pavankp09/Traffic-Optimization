import { create } from 'zustand'
import type { SimFrame, AdverseEvent, SignalState, EpisodeMetrics, Decision } from '../types'
import { useSessionStore } from './sessionStore'

// No baseline persistence in localStorage — baseline metrics will reset on reload.

interface SimulationState {
  // Live simulation data
  currentFrame: SimFrame | null
  frameHistory: SimFrame[]    // last 100 frames for trail rendering
  adverseEvents: AdverseEvent[]

  // Multi-model frames
  baselineFrame: SimFrame | null
  rl1Frame: SimFrame | null
  rl2Frame: SimFrame | null
  rl3Frame: SimFrame | null
  rl4Frame: SimFrame | null
  customFrame: SimFrame | null

  // Model selections
  selectedModelSingle: string
  selectedModelsSplit: string[]
  trainedModels: string[]

  // View mode
  viewMode: 'single' | 'split'

  // Signal state (current phase per TL)
  signalStates: Record<string, SignalState>

  // Simulation controls
  isRunning: boolean
  isPaused: boolean
  sessionId: string | null
  simTimeS: number
  throughputCount: number   // cumulative vehicles that have exited the scene
  simSpeed: 1 | 5 | 10 | 20  // current speed multiplier

  // Last stored simulation metrics per model key
  lastSimulationMetrics: Record<string, EpisodeMetrics>

  // Popup simulation state per episode (isolated replay)
  popupFrames: Record<number, SimFrame | null>
  popupRunning: Record<number, boolean>
  popupPaused: Record<number, boolean>
  popupSpeeds: Record<number, 1 | 5 | 10 | 20>
  popupDurations: Record<number, number>
  popupSimTimes: Record<number, number>
  popupSids: Record<number, string | null>

  // UI state for TrainingIntelligenceModal
  intelSelectedEp: number | null
  intelSortMode: 'ep_desc' | 'ep_asc' | 'r_desc' | 'r_asc'
  intelFilter: 'all' | 'top10' | 'bot10'
  intelDetailTab: 'timeline' | 'phases' | 'simulate'
  intelSelectedDecision: Decision | null
  intelLiveReplayExpanded: boolean

  // Actions
  setFrame: (frame: SimFrame) => void
  setBaselineFrame: (frame: SimFrame | null) => void
  setRl1Frame: (frame: SimFrame | null) => void
  setRl2Frame: (frame: SimFrame | null) => void
  setRl3Frame: (frame: SimFrame | null) => void
  setRl4Frame: (frame: SimFrame | null) => void
  setCustomFrame: (frame: SimFrame | null) => void
  setSelectedModelSingle: (model: string) => void
  setSelectedModelsSplit: (models: string[]) => void
  setViewMode: (mode: 'single' | 'split') => void
  addTrainedModel: (model: string) => void
  addAdverseEvent: (event: AdverseEvent) => void
  clearAdverseEvents: () => void
  setRunning: (running: boolean) => void
  setPaused: (paused: boolean) => void
  setSessionId: (id: string | null) => void
  setSimSpeed: (speed: 1 | 5 | 10 | 20) => void
  resetSimulation: () => void
  clearFrames: () => void
  clearRlFrames: () => void
  setLastSimulationMetrics: (model: string, metrics: EpisodeMetrics) => void
  resetLastSimulationMetrics: () => void

  // Actions for popup simulation
  setPopupFrame: (ep: number, frame: SimFrame | null) => void
  setPopupRunning: (ep: number, running: boolean) => void
  setPopupPaused: (ep: number, paused: boolean) => void
  setPopupSpeed: (ep: number, speed: 1 | 5 | 10 | 20) => void
  setPopupDuration: (ep: number, duration: number) => void
  setPopupSimTime: (ep: number, time: number) => void
  setPopupSid: (ep: number, sid: string | null) => void

  setIntelSelectedEp: (ep: number | null) => void
  setIntelSortMode: (mode: 'ep_desc' | 'ep_asc' | 'r_desc' | 'r_asc') => void
  setIntelFilter: (filter: 'all' | 'top10' | 'bot10') => void
  setIntelDetailTab: (tab: 'timeline' | 'phases' | 'simulate') => void
  setIntelSelectedDecision: (decision: Decision | null) => void
  setIntelLiveReplayExpanded: (expanded: boolean) => void

  prepareForTraining: () => void
  resetIntelUIState: () => void
  clearAllPopups: () => void
  clearBaselineResults: () => void
}

export const useSimulationStore = create<SimulationState>((set) => ({
  currentFrame: null,
  frameHistory: [],
  adverseEvents: [],

  baselineFrame: null,
  rl1Frame: null,
  rl2Frame: null,
  rl3Frame: null,
  rl4Frame: null,
  customFrame: null,

  selectedModelSingle: 'baseline',
  selectedModelsSplit: ['baseline', 'rl1'],
  trainedModels: [],
  viewMode: 'single',

  signalStates: {},
  isRunning: false,
  isPaused: false,
  sessionId: null,
  simTimeS: 0,
  throughputCount: 0,
  simSpeed: 1,
  lastSimulationMetrics: {},

  popupFrames: {},
  popupRunning: {},
  popupPaused: {},
  popupSpeeds: {},
  popupDurations: {},
  popupSimTimes: {},
  popupSids: {},

  intelSelectedEp: null,
  intelSortMode: 'ep_desc',
  intelFilter: 'all',
  intelDetailTab: 'timeline',
  intelSelectedDecision: null,
  intelLiveReplayExpanded: false,

  setFrame: (frame) =>
    set((state) => {
      const prevIds = new Set(state.currentFrame?.vehicles.map((v) => v.id) ?? [])
      const currIds = new Set(frame.vehicles.map((v) => v.id))
      const exited = [...prevIds].filter((id) => !currIds.has(id)).length
      return {
        currentFrame: frame,
        simTimeS: frame.sim_time_s,
        signalStates: Object.fromEntries(frame.signals.map((s) => [s.tl_id, s])),
        frameHistory: [...state.frameHistory.slice(-99), frame],
        throughputCount: state.throughputCount + exited,
      }
    }),

  setBaselineFrame: (frame) => set({ baselineFrame: frame }),
  setRl1Frame: (frame) => set({ rl1Frame: frame }),
  setRl2Frame: (frame) => set({ rl2Frame: frame }),
  setRl3Frame: (frame) => set({ rl3Frame: frame }),
  setRl4Frame: (frame) => set({ rl4Frame: frame }),
  setCustomFrame: (frame) => set({ customFrame: frame }),

  setSelectedModelSingle: (model) =>
    set((state) => {
      let frame = state.rl1Frame
      if (model === 'baseline') frame = state.baselineFrame
      else if (model === 'rl1') frame = state.rl1Frame
      else if (model === 'rl2') frame = state.rl2Frame
      else if (model === 'rl3') frame = state.rl3Frame
      else if (model === 'rl4') frame = state.rl4Frame
      else if (model === 'custom') frame = state.customFrame
      return {
        selectedModelSingle: model,
        currentFrame: frame,
      }
    }),
  setSelectedModelsSplit: (models) => set({ selectedModelsSplit: models }),
  setViewMode: (mode) => set({ viewMode: mode }),
  addTrainedModel: (model) =>
    set((state) => {
      if (state.trainedModels.includes(model)) return {}
      return { trainedModels: [...state.trainedModels, model] }
    }),

  addAdverseEvent: (event) =>
    set((state) => ({ adverseEvents: [...state.adverseEvents.slice(-19), event] })),

  clearAdverseEvents: () => set({ adverseEvents: [] }),
  setRunning: (running) => set({ isRunning: running }),
  setPaused: (paused) => set({ isPaused: paused }),
  setSessionId: (id) => set({ sessionId: id }),
  setSimSpeed: (speed) => set({ simSpeed: speed }),

  resetSimulation: () => {
    set({
      currentFrame: null,
      frameHistory: [],
      rl1Frame: null,
      rl2Frame: null,
      rl3Frame: null,
      rl4Frame: null,
      customFrame: null,
      adverseEvents: [],
      signalStates: {},
      isRunning: false,
      isPaused: false,
      sessionId: null,
      simTimeS: 0,
      simSpeed: 1,
      throughputCount: 0,
    })
  },

  clearFrames: () =>
    set({
      currentFrame: null,
      frameHistory: [],
      rl1Frame: null,
      rl2Frame: null,
      rl3Frame: null,
      rl4Frame: null,
      customFrame: null,
      simTimeS: 0,  // reset the clock only when a fresh simulation begins
    }),

  // Clear only RL frames — preserves baselineFrame and baseline metrics so
  // switching to an RL tab after a baseline run doesn't lose the reference data.
  clearRlFrames: () =>
    set((state) => ({
      currentFrame: null,
      frameHistory: [],
      rl1Frame: null,
      rl2Frame: null,
      rl3Frame: null,
      rl4Frame: null,
      customFrame: null,
      simTimeS: 0,
      lastSimulationMetrics: {
        // Keep only the baseline metrics
        ...(state.lastSimulationMetrics['baseline']
          ? { baseline: state.lastSimulationMetrics['baseline'] }
          : {}),
      },
    })),

  setLastSimulationMetrics: (model, metrics) =>
    set((state) => ({
      lastSimulationMetrics: {
        ...state.lastSimulationMetrics,
        [model]: metrics,
      },
    })),

  resetLastSimulationMetrics: () => {
    set({ lastSimulationMetrics: {} })
  },

  setPopupFrame: (ep, frame) => set((state) => ({ popupFrames: { ...state.popupFrames, [ep]: frame } })),
  setPopupRunning: (ep, running) => set((state) => ({ popupRunning: { ...state.popupRunning, [ep]: running } })),
  setPopupPaused: (ep, paused) => set((state) => ({ popupPaused: { ...state.popupPaused, [ep]: paused } })),
  setPopupSpeed: (ep, speed) => set((state) => ({ popupSpeeds: { ...state.popupSpeeds, [ep]: speed } })),
  setPopupDuration: (ep, duration) => set((state) => ({ popupDurations: { ...state.popupDurations, [ep]: duration } })),
  setPopupSimTime: (ep, time) => set((state) => ({ popupSimTimes: { ...state.popupSimTimes, [ep]: time } })),
  setPopupSid: (ep, sid) => set((state) => ({ popupSids: { ...state.popupSids, [ep]: sid } })),

  setIntelSelectedEp: (ep) => set({ intelSelectedEp: ep }),
  setIntelSortMode: (mode) => set({ intelSortMode: mode }),
  setIntelFilter: (filter) => set({ intelFilter: filter }),
  setIntelDetailTab: (tab) => set({ intelDetailTab: tab }),
  setIntelSelectedDecision: (decision) => set({ intelSelectedDecision: decision }),
  setIntelLiveReplayExpanded: (expanded) => set({ intelLiveReplayExpanded: expanded }),

  prepareForTraining: () =>
    set((state) => ({
      currentFrame: null,
      frameHistory: [],
      rl1Frame: null,
      rl2Frame: null,
      rl3Frame: null,
      rl4Frame: null,
      customFrame: null,
      adverseEvents: [],
      signalStates: {},
      isRunning: false,
      isPaused: false,
      sessionId: null,
      simTimeS: 0,
      simSpeed: 1,
      throughputCount: 0,
      lastSimulationMetrics: {
        ...(state.lastSimulationMetrics['baseline']
          ? { baseline: state.lastSimulationMetrics['baseline'] }
          : {}),
      },
    })),

  resetIntelUIState: () =>
    set({
      intelSelectedEp: null,
      intelSortMode: 'ep_desc',
      intelFilter: 'all',
      intelDetailTab: 'timeline',
      intelSelectedDecision: null,
      intelLiveReplayExpanded: false,
    }),

  clearAllPopups: () =>
    set({
      popupFrames: {},
      popupRunning: {},
      popupPaused: {},
      popupSpeeds: {},
      popupDurations: {},
      popupSimTimes: {},
      popupSids: {},
    }),

  clearBaselineResults: () => {
    // Clear baseline frame and delete its metrics from active store
    set((state) => {
      const updatedMetrics = { ...state.lastSimulationMetrics }
      delete updatedMetrics['baseline']
      return {
        baselineFrame: null,
        lastSimulationMetrics: updatedMetrics,
      }
    })

    // Clear session-related baseline data
    useSessionStore.getState().setBaselineMetrics(null)
    useSessionStore.getState().setBaselineCompleted(false)
    useSessionStore.getState().setBaselineData(null)
    useSessionStore.getState().setEconomic(null)
  },
}))
