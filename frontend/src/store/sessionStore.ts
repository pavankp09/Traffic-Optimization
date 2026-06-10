import { create } from 'zustand'
import type { SessionInfo, TrainingEpisodePayload, InsightCard, EpisodeMetrics, EconomicSummary } from '../types'

export interface TrainedModelData {
  episodes: TrainingEpisodePayload[]
  rewardCurve: number[]
  waitCurve: number[]
  insights: InsightCard[]
  isConverged: boolean
  bestReward: number
  currentMetrics: EpisodeMetrics | null
  baselineMetrics: EpisodeMetrics | null
  economic: EconomicSummary | null
}

interface SessionState {
  // Active session
  activeSessionId: string | null
  sessions: SessionInfo[]

  // Training data
  episodes: TrainingEpisodePayload[]
  rewardCurve: number[]           // episode rewards in order
  waitCurve: number[]             // avg wait per episode
  insights: InsightCard[]
  isTraining: boolean
  isTrainingPaused: boolean
  // Which model key the backend is actively training (null = none). The global
  // isTraining flag stays true so socket handlers keep capturing episodes even
  // while viewing another tab; this scopes the *UI* to the correct tab.
  trainingModelKey: string | null
  isConverged: boolean
  bestReward: number

  // Metrics
  currentMetrics: EpisodeMetrics | null
  baselineMetrics: EpisodeMetrics | null
  economic: EconomicSummary | null

  // Pre-computed baseline from Baseline tab (used by RL training)
  baselineData: { mean_wait: number; throughput: number; controller: string } | null
  isBaselineCompleted: boolean

  // Persistent in-memory cache
  trainedModelDetails: Record<string, TrainedModelData>

  trainingStage: number
  setTrainingStage: (s: number) => void

  // Actions
  setActiveSession: (id: string | null) => void
  setSessions: (sessions: SessionInfo[]) => void
  addSession: (session: SessionInfo) => void
  addEpisode: (ep: TrainingEpisodePayload) => void
  addInsight: (insight: InsightCard) => void
  setConverged: (converged: boolean) => void
  setTraining: (training: boolean) => void
  setTrainingPaused: (paused: boolean) => void
  setTrainingModelKey: (key: string | null) => void
  setCurrentMetrics: (metrics: EpisodeMetrics | null) => void
  setBaselineMetrics: (metrics: EpisodeMetrics | null) => void
  setBaselineCompleted: (completed: boolean) => void
  setBaselineData: (data: { mean_wait: number; throughput: number; controller: string } | null) => void
  setEconomic: (economic: EconomicSummary | null) => void
  resetSession: () => void
  saveModelDetails: (modelKey: string) => void
  loadModelDetails: (modelKey: string) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSessionId: null,
  sessions: [],
  episodes: [],
  rewardCurve: [],
  waitCurve: [],
  insights: [],
  isTraining: false,
  isTrainingPaused: false,
  trainingModelKey: null,
  isConverged: false,
  trainingStage: 0,
  bestReward: -Infinity,
  currentMetrics: null,
  baselineMetrics: null,
  economic: null,
  baselineData: null,
  isBaselineCompleted: false,
  trainedModelDetails: {},

  setTrainingStage: (s) => set({ trainingStage: s }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  setSessions: (sessions) => set({ sessions }),
  addSession: (session) =>
    set((state) => ({ sessions: [...state.sessions, session] })),
  addEpisode: (ep) =>
    set((state) => ({
      episodes: [...state.episodes.slice(-499), ep],
      rewardCurve: [...state.rewardCurve.slice(-499), ep.reward],
      waitCurve: [...state.waitCurve.slice(-499), ep.metrics?.mean_wait ?? 0],
      bestReward: Math.max(state.bestReward, ep.reward),
    })),
  addInsight: (insight) =>
    set((state) => ({ insights: [...state.insights.slice(-49), insight] })),
  setConverged: (converged) => set({ isConverged: converged }),
  setTraining: (training) => set({ isTraining: training }),
  setTrainingPaused: (paused) => set({ isTrainingPaused: paused }),
  setTrainingModelKey: (key) => set({ trainingModelKey: key }),
  setCurrentMetrics: (metrics) => set({ currentMetrics: metrics }),
  setBaselineMetrics: (metrics) =>
    set((state) => {
      // Propagate baseline updates dynamically to all cached RL models
      const updatedDetails = { ...state.trainedModelDetails }
      Object.keys(updatedDetails).forEach((key) => {
        if (updatedDetails[key]) {
          updatedDetails[key] = {
            ...updatedDetails[key],
            baselineMetrics: metrics,
          }
        }
      })
      return {
        baselineMetrics: metrics,
        trainedModelDetails: updatedDetails,
      }
    }),
  setBaselineCompleted: (completed) => set({ isBaselineCompleted: completed }),
  setBaselineData: (data) => set({ baselineData: data }),
  setEconomic: (economic) => set({ economic }),
  resetSession: () =>
    set({
      episodes: [],
      rewardCurve: [],
      waitCurve: [],
      insights: [],
      isTraining: false,
      isTrainingPaused: false,
      isConverged: false,
      bestReward: -Infinity,
      currentMetrics: null,
      // baselineMetrics is intentionally preserved to act as a reference benchmark across resets
      economic: null,
    }),

  saveModelDetails: (modelKey) =>
    set((state) => ({
      trainedModelDetails: {
        ...state.trainedModelDetails,
        [modelKey]: {
          episodes: state.episodes,
          rewardCurve: state.rewardCurve,
          waitCurve: state.waitCurve,
          insights: state.insights,
          isConverged: state.isConverged,
          bestReward: state.bestReward,
          currentMetrics: state.currentMetrics,
          baselineMetrics: state.baselineMetrics,
          economic: state.economic,
        },
      },
    })),

  loadModelDetails: (modelKey) =>
    set((state) => {
      const details = state.trainedModelDetails[modelKey]
      if (details) {
        return {
          episodes: details.episodes,
          rewardCurve: details.rewardCurve,
          waitCurve: details.waitCurve,
          insights: details.insights,
          isConverged: details.isConverged,
          bestReward: details.bestReward,
          currentMetrics: details.currentMetrics,
          baselineMetrics: details.baselineMetrics ?? state.baselineMetrics,
          economic: details.economic,
        }
      } else {
        return {
          episodes: [],
          rewardCurve: [],
          waitCurve: [],
          insights: [],
          isConverged: false,
          bestReward: -Infinity,
          currentMetrics: null,
          baselineMetrics: state.baselineMetrics,
          economic: null,
        }
      }
    }),
}))
