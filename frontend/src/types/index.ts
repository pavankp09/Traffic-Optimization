// Vehicle types from backend
export type VehicleTypeId =
  | 'car' | 'two_wheeler' | 'ev_scooter' | 'auto_rickshaw' | 'e_rickshaw'
  | 'cab' | 'delivery_bike' | 'tsrtc_bus' | 'school_bus' | 'truck'

// ---- Socket.IO payload types ----

export interface VehicleFrame {
  id: string
  type_id: VehicleTypeId
  x: number
  y: number
  speed: number
  wait_time: number
  lane: string
  arm: 'N' | 'S' | 'E' | 'W'
  angle?: number   // radians override for turning vehicles
  turn?: 'straight' | 'right' | 'left'
}

export interface SignalState {
  tl_id: string
  phase: number
  elapsed_s: number
  duration_s?: number    // total duration of current phase (s)
  remaining_s?: number   // seconds left in current phase
}

export interface SimAggStats {
  on_canvas: number
  in_queue: number
  exited: number
  avg_wait_s: number
  instant_wait_s: number
  throughput_vph: number
  instant_tput_vph: number
  tick_ms: number
  fps: number
}

export interface SimFrame {
  vehicles: VehicleFrame[]
  pedestrians?: PedestrianFrame[]
  signals: SignalState[]
  step: number
  sim_time_s: number
  max_sim_time_s?: number
  session_id?: string
  stats?: SimAggStats
  policy_mode?: 'fixed_time' | 'websters' | 'model' | 'heuristic' | 'replay'
}

export interface AdverseEvent {
  event_type: string
  severity: number
  location: string
  duration_s: number
  payload: Record<string, unknown>
}

export interface TrainingEpisodePayload {
  session_id: string
  episode: number
  reward: number
  length: number
  metrics: {
    mean_wait: number
    throughput: number
  }
}

export interface InsightCard {
  session_id: string
  episode_number: number
  icon: string
  message: string
  card_type: 'milestone' | 'warning' | 'achievement'
  metric_value: number
  metric_key: string
}

// ---- Metrics types ----

export interface ArmMetrics {
  arm: 'N' | 'S' | 'E' | 'W'
  queue_len: number
  avg_wait_s: number
  flow_rate_vph: number
  heavy_vehicle_ratio: number
  green_time_used_s: number
  green_time_total_s: number
}

export interface VehicleMetrics {
  type_id: string
  count: number
  avg_wait_s: number
  avg_queue_len: number
  throughput_vph: number
}

export interface EpisodeMetrics {
  episode_id: string
  session_id: string
  duration_s: number
  n_vehicles: number
  avg_wait_s: number
  per_type: Record<string, VehicleMetrics>
  per_arm: Record<string, ArmMetrics>
  throughput_vph: number
  green_utilisation: number
  collision_count: number
  violation_count: number
  signal_efficiency: number
  avg_phase_duration_s: number
  adverse_events_count: number
  total_delay_veh_hrs: number
}

export interface MetricsDelta {
  wait_reduction_s: number
  throughput_gain_vph: number
  green_util_improvement: number
  collision_reduction: number
  violation_reduction: number
  efficiency_gain: number
  delay_reduction_veh_hrs: number
  wait_reduction_pct: number
}

// ---- Economic types ----

export interface EconomicSummary {
  session_id: string
  baseline_avg_wait_s: number
  rl_avg_wait_s: number
  wait_reduction_s: number
  fuel_saved_l_per_veh: number
  co2_avoided_kg_per_veh: number
  fuel_cost_saved_inr_per_veh: number
  time_value_saved_inr_per_veh: number
  total_saving_inr_per_veh: number
  total_fuel_saved_l: number
  total_co2_avoided_kg: number
  total_co2_avoided_tonne: number
  total_fuel_cost_saved_inr: number
  total_time_value_saved_inr: number
  total_saving_inr: number
  carbon_credit_value_inr: number
  city_intersections: number
  city_daily_saving_inr: number
  city_annual_saving_inr: number
  city_annual_co2_avoided_tonne: number
  per_type: Record<string, unknown>
}

// ---- Config types ----

export interface SimConfig {
  intersection_type: 'four_way' | 't_junction' | 'y_junction' | 'six_arm' | 'roundabout' | 'four_way_free_left' | 't_junction_free_left' | 'roundabout_free_left' | 'custom'
  n_lanes: number
  total_vph: number
  traffic_pattern: 'uniform' | 'morning_peak' | 'evening_peak' | 'bidirectional' | 'random'
  arrival_distribution: 'poisson' | 'weibull' | 'uniform'
  pct_car: number
  pct_two_wheeler: number
  pct_ev_scooter: number
  pct_auto_rickshaw: number
  pct_e_rickshaw: number
  pct_cab: number
  pct_delivery_bike: number
  pct_tsrtc_bus: number
  pct_school_bus: number
  pct_truck: number
  n_phases: number
  phase_min_green_s: number
  phase_max_green_s: number
  yellow_time_s: number
  all_red_time_s: number
  cycle_length_s: number
  rl_algorithm: string
  total_timesteps: number
  learning_rate: number
  hidden_layer_size?: number
  discount_factor?: number
  reward_wt_queue?: number
  reward_wt_wait?: number
  reward_wt_throughput?: number
  reward_wt_collision?: number
  reward_wt_pedestrian?: number
  reward_wt_emergency?: number
  reward_wt_switch?: number
  simulation_duration_s: number
  warm_up_s: number
  sim_speed_multiplier: number
  enable_rtsp: boolean
  rtsp_url: string
  yolo_confidence: number
  baseline_wait_delay?: number
  baseline_throughput?: number
  baseline_green_util?: number
  baseline_coordination?: number
  baseline_controller?: 'fixed_time' | 'websters'
  [key: string]: unknown
}

export interface AdverseConfig {
  collision_probability: number
  rear_end_risk_factor: number
  red_light_run_prob: number
  signal_failure_prob: number
  signal_failure_mode: 'stuck_red' | 'stuck_green' | 'flicker' | 'off'
  waterlogging_enabled: boolean
  waterlogging_severity: number
  vip_convoy_enabled: boolean
  vip_convoy_frequency_hr: number
  camera_dropout_prob: number
  sensor_noise_std: number
  [key: string]: unknown
}

// ---- Preset types ----

export interface PresetSummary {
  id: string
  name: string
  group: string
  description: string
  tags: string[]
}

export interface Preset extends PresetSummary {
  sim_config: Partial<SimConfig>
  adverse_config: Partial<AdverseConfig>
}

// ---- Session types ----

export interface SessionInfo {
  session_id: string
  status: 'idle' | 'running' | 'done' | 'error'
  total_episodes: number
  best_reward: number
  location: string
  created_at: string
}

// ---- Report types ----

export interface ReportData {
  session_id: string
  location: string
  generated_at: string
  headline_metric: string
  key_achievements: string[]
  recommendations: string[]
}

// ---- RL Decision Dashboard types ----

export interface ObsFeature {
  label: string
  value: number
  normalised: number
}

export interface ActionInfo {
  phase: number
  phase_name: string
  duration_s: number
  action_idx: number
}

export interface RewardParts {
  delta_queue:  number
  flow_eff:     number
  switch:       number
  imbalance:    number
  starvation:   number
  baseline_gap: number
  all_red:      number
}

export interface Decision {
  step:         number
  episode:      number
  obs:          ObsFeature[]
  action:       ActionInfo
  probs:        number[]    // length 35, reshaped [5][7] for heatmap
  importance:   number[]    // length 26, normalised 0..1
  value:        number
  reward_total: number
  reward_parts: RewardParts
}

export interface EpisodeSummary {
  ep:           number
  total_reward: number
  mean_wait:    number
  throughput:   number
  n_decisions:  number
}

export interface PedestrianFrame {
  id:        string
  arm:       'N' | 'S' | 'E' | 'W'
  x:         number
  y:         number
  state:     'waiting' | 'crossing_1' | 'at_median' | 'crossing_2' | 'done'
  compliant: boolean
}
