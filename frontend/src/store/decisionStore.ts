import { create } from 'zustand'
import type { Decision, EpisodeSummary } from '../types'

export interface LiveEpisodeSummary {
  episode:      number
  total_reward: number
  mean_wait:    number
  throughput:   number
  n_decisions:  number
}

interface DecisionState {
  // Live data during training — ALL decisions kept, no truncation
  liveDecisions:      Decision[]
  liveEpisode:        number
  liveEpisodeHistory: LiveEpisodeSummary[]   // one entry per completed episode
  isInferenceRunning: boolean                // kept for compat, unused

  // Post-training replay
  episodes:       EpisodeSummary[]
  currentEpisode: number
  currentDecision: number
  episodeCache:   Record<number, Decision[]>
  selectedDecision: Decision | null
  replaySessionId: string | null

  // Actions
  appendDecision:     (d: Decision) => void
  addEpisodeSummary:  (s: LiveEpisodeSummary) => void
  setInferenceRunning:(v: boolean) => void   // kept for compat
  clearLive:          () => void
  setEpisodes:        (eps: EpisodeSummary[]) => void
  setCurrentEpisode:  (ep: number) => void
  setCurrentDecision: (idx: number) => void
  cacheEpisodeData:   (ep: number, decisions: Decision[]) => void
  setSelectedDecision:(d: Decision | null) => void
  setReplaySessionId: (id: string | null) => void
  fetchEpisodes:      (sessionId: string) => Promise<void>
  fetchEpisodeData:   (sessionId: string, ep: number) => Promise<void>

  // Derived helper: decisions grouped by episode number
  decisionsByEpisode: () => Record<number, Decision[]>
}

export const useDecisionStore = create<DecisionState>((set, get) => ({
  liveDecisions:      [],
  liveEpisode:        0,
  liveEpisodeHistory: [],
  isInferenceRunning: false,
  episodes:           [],
  currentEpisode:     1,
  currentDecision:    0,
  episodeCache:       {},
  selectedDecision:   null,
  replaySessionId:    null,

  // Keep ALL decisions — no truncation — so all episodes are visible
  appendDecision: (d) =>
    set((s) => ({
      liveDecisions: [...s.liveDecisions, d],
      liveEpisode:   d.episode,
    })),

  addEpisodeSummary: (s) =>
    set((state) => ({
      liveEpisodeHistory: [...state.liveEpisodeHistory, s],
    })),

  setInferenceRunning: (_v) => {},   // no-op — inference removed
  clearLive: () => set({ liveDecisions: [], liveEpisode: 0, liveEpisodeHistory: [] }),

  setEpisodes:        (eps) => set({ episodes: eps }),

  setCurrentEpisode:  (ep) =>
    set({ currentEpisode: ep, currentDecision: 0, selectedDecision: null }),

  setCurrentDecision: (idx) => {
    const { episodeCache, currentEpisode } = get()
    const decisions = episodeCache[currentEpisode] ?? []
    set({ currentDecision: idx, selectedDecision: decisions[idx] ?? null })
  },

  cacheEpisodeData: (ep, decisions) =>
    set((s) => ({ episodeCache: { ...s.episodeCache, [ep]: decisions } })),

  setSelectedDecision: (d) => set({ selectedDecision: d }),
  setReplaySessionId:  (id) => set({ replaySessionId: id }),

  fetchEpisodes: async (sessionId) => {
    try {
      const res = await fetch(`/api/decisions/${sessionId}`)
      if (!res.ok) return
      const data: EpisodeSummary[] = await res.json()
      set({ episodes: data, replaySessionId: sessionId })
    } catch (e) {
      console.error('[decisionStore] fetchEpisodes error', e)
    }
  },

  fetchEpisodeData: async (sessionId, ep) => {
    if (get().episodeCache[ep]) return
    try {
      const res = await fetch(`/api/decisions/${sessionId}/${ep}`)
      if (!res.ok) return
      const data = await res.json()
      const decisions: Decision[] = data.decisions ?? []
      get().cacheEpisodeData(ep, decisions)
      if (get().currentEpisode === ep) {
        const idx = get().currentDecision
        set({ selectedDecision: decisions[idx] ?? null })
      }
    } catch (e) {
      console.error('[decisionStore] fetchEpisodeData error', e)
    }
  },

  // Group all live decisions by episode number for sidebar display
  decisionsByEpisode: () => {
    const map: Record<number, Decision[]> = {}
    for (const d of get().liveDecisions) {
      if (!map[d.episode]) map[d.episode] = []
      map[d.episode].push(d)
    }
    return map
  },
}))
