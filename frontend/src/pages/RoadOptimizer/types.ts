// Types for the Road Optimizer tab

export interface NamedIntersection {
  id: string
  name: string
  city: string
  arms: number
  lanes_per_arm: number
  traffic_volume_vph: number
  vehicle_mix: string
  traffic_pattern: string
  description: string
}

export interface IntersectionConfig {
  id: string
  name: string
  arms: number
  lanes_per_arm: number
  traffic_volume_vph: number
  vehicle_mix: string
  traffic_pattern: string
}

export interface ScenarioTypeDefinition {
  type: string
  label: string
  description: string
  icon: string
  color: string
  overrides: Record<string, unknown>
}

export type TrainingDepth = 'quick' | 'full'
export type ScenarioStatus = 'idle' | 'running' | 'done' | 'error'

export interface ScenarioKpi {
  avg_wait_s: number
  avg_queue_len: number
  throughput_vph: number
  flow_efficiency: number
  episode_reward: number
  episodes_trained: number
  convergence_episode: number | null
  training_curve: Array<{ episode: number; reward: number }>
}

export interface Scenario {
  scenario_id: string
  label: string
  scenario_type: string
  training_depth: TrainingDepth
  phase_scheme?: string
  extra_arm_target?: number
  user_overrides?: Record<string, unknown>
  evaluation_model?: string
  // runtime state
  status: ScenarioStatus
  progress: number       // 0-100
  current_episode: number
  total_episodes: number
  live_reward: number
  kpi: ScenarioKpi | null
  error: string | null
  sim_config_summary?: Record<string, unknown>
}

export interface LLMRankedScenario {
  rank: number
  scenario_id: string
  label: string
  scenario_type: string
  headline: string
  analysis: string
  vs_baseline_wait_pct: number
  vs_baseline_throughput_pct: number
  implementation_notes: string
  feasibility: string
  recommendation_strength: string
}

export interface LLMReport {
  intersection: string
  summary: string
  ranked_scenarios: LLMRankedScenario[]
  top_recommendation: {
    label: string
    reason: string
    estimated_benefit: string
  }
  best_cost_benefit: {
    label: string
    reason: string
  }
  caveats: string[]
  llm_used?: boolean
}

export interface LLMRecommendation {
  success: boolean
  key_missing?: boolean
  error?: string
  data: LLMReport
}
