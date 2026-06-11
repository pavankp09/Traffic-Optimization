import { create } from 'zustand'
import { useSimulationStore } from './simulationStore'
import type { SimConfig, AdverseConfig, Preset } from '../types'

// Default values matching Python DEFAULT_SIM_CONFIG
const DEFAULT_SIM_CONFIG: SimConfig = {
  intersection_type: 'four_way',
  n_lanes: 3,
  total_vph: 10000,
  traffic_pattern: 'uniform',
  arrival_distribution: 'poisson',
  pct_car: 40,
  pct_two_wheeler: 25,
  pct_ev_scooter: 10,
  pct_auto_rickshaw: 10,
  pct_e_rickshaw: 5,
  pct_cab: 4,
  pct_delivery_bike: 3,
  pct_tsrtc_bus: 2,
  pct_school_bus: 0,
  pct_truck: 1,
  n_phases: 5,
  phase_min_green_s: 15,
  phase_max_green_s: 60,
  yellow_time_s: 4,
  all_red_time_s: 2,
  cycle_length_s: 120,
  rl_algorithm: 'PPO',
  total_timesteps: 500000,
  learning_rate: 0.0003,
  hidden_layer_size: 64,
  discount_factor: 0.99,
  reward_wt_queue: 1.0,
  reward_wt_wait: 0.5,
  reward_wt_throughput: 2.0,
  reward_wt_collision: 1.5,
  reward_wt_pedestrian: 0.8,
  reward_wt_emergency: 0.5,
  reward_wt_switch: 0.15,
  simulation_duration_s: 1800,
  warm_up_s: 60,
  sim_speed_multiplier: 20,
  enable_rtsp: false,
  rtsp_url: '',
  yolo_confidence: 0.5,
  baseline_wait_delay: 85,
  baseline_throughput: 440,
  baseline_green_util: 85,
  baseline_coordination: 83,
  same_as_baseline: false,
}

const DEFAULT_ADVERSE_CONFIG: AdverseConfig = {
  collision_probability: 0.02,
  rear_end_risk_factor: 0.1,
  red_light_run_prob: 0.05,
  signal_failure_prob: 0.01,
  signal_failure_mode: 'stuck_red',
  waterlogging_enabled: false,
  waterlogging_severity: 0.0,
  vip_convoy_enabled: false,
  vip_convoy_frequency_hr: 2.0,
  camera_dropout_prob: 0.0,
  sensor_noise_std: 0.0,
}

interface ConfigState {
  simConfig: SimConfig
  adverseConfig: AdverseConfig
  activePreset: Preset | null
  isDirty: boolean           // true if config differs from loaded preset
  tabConfigs: Record<string, SimConfig>

  // Actions
  updateSimConfig: (updates: Partial<SimConfig>) => void
  updateAdverseConfig: (updates: Partial<AdverseConfig>) => void
  loadPreset: (preset: Preset) => void
  resetToDefaults: () => void
  setIsDirty: (dirty: boolean) => void
  saveTabConfig: (modelKey: string, config: SimConfig) => void
  loadTabConfig: (modelKey: string) => void
}

const INITIAL_TAB_CONFIGS: Record<string, SimConfig> = {
  baseline: {
    ...DEFAULT_SIM_CONFIG,
    rl_algorithm: 'Fixed-Time',
    learning_rate: 0,
    discount_factor: 0,
    hidden_layer_size: 0,
  },
  rl1: {
    ...DEFAULT_SIM_CONFIG,
    rl_algorithm: 'PPO',
    learning_rate: 0.0003,
    discount_factor: 0.99,
    hidden_layer_size: 64,
  },
  rl2: {
    ...DEFAULT_SIM_CONFIG,
    rl_algorithm: 'DQN',
    learning_rate: 0.0001,
    discount_factor: 0.95,
    hidden_layer_size: 128,
  },
  rl3: {
    ...DEFAULT_SIM_CONFIG,
    rl_algorithm: 'SAC',
    learning_rate: 0.0003,
    discount_factor: 0.98,
    hidden_layer_size: 256,
  },
  rl4: {
    ...DEFAULT_SIM_CONFIG,
    rl_algorithm: 'A2C',
    learning_rate: 0.0007,
    discount_factor: 0.99,
    hidden_layer_size: 32,
  },
  custom: {
    ...DEFAULT_SIM_CONFIG,
    rl_algorithm: 'PPO',
    learning_rate: 0.0003,
    discount_factor: 0.99,
    hidden_layer_size: 64,
  },
}

export const useConfigStore = create<ConfigState>((set) => ({
  simConfig: DEFAULT_SIM_CONFIG,
  adverseConfig: DEFAULT_ADVERSE_CONFIG,
  activePreset: null,
  isDirty: false,
  tabConfigs: INITIAL_TAB_CONFIGS,

  updateSimConfig: (updates) =>
    set((state) => {
      const activeModel = useSimulationStore.getState().selectedModelSingle
      const newConfig = { ...state.simConfig, ...updates }
      return {
        simConfig: newConfig,
        tabConfigs: { ...state.tabConfigs, [activeModel]: newConfig },
        isDirty: true,
      }
    }),

  updateAdverseConfig: (updates) =>
    set((state) => ({
      adverseConfig: { ...state.adverseConfig, ...updates },
      isDirty: true,
    })),

  loadPreset: (preset) =>
    set((state) => {
      const volume = Number(preset.sim_config.total_vph || preset.sim_config.traffic_volume_vph || 900)
      const calculatedWait = Math.round(30 + (volume / 20))
      const calculatedTput = Math.round(Math.min(volume * 0.45, 450 + (volume * 0.1)))
      const calculatedUtil = Math.round(Math.min(95, 60 + (volume / 50)))
      const calculatedCoord = Math.round(Math.max(45, 85 - (volume / 60)))

      const presetSimConfig: SimConfig = {
        ...DEFAULT_SIM_CONFIG,
        ...(preset.sim_config as Partial<SimConfig>),
        baseline_wait_delay: calculatedWait,
        baseline_throughput: calculatedTput,
        baseline_green_util: calculatedUtil,
        baseline_coordination: calculatedCoord,
      }

      return {
        simConfig: presetSimConfig,
        adverseConfig: { ...DEFAULT_ADVERSE_CONFIG, ...(preset.adverse_config as Partial<AdverseConfig>) },
        activePreset: preset,
        isDirty: false,
      }
    }),

  resetToDefaults: () =>
    set({
      simConfig: DEFAULT_SIM_CONFIG,
      adverseConfig: DEFAULT_ADVERSE_CONFIG,
      activePreset: null,
      isDirty: false,
      tabConfigs: INITIAL_TAB_CONFIGS,
    }),

  setIsDirty: (dirty) => set({ isDirty: dirty }),

  saveTabConfig: (modelKey, config) =>
    set((state) => ({
      tabConfigs: { ...state.tabConfigs, [modelKey]: config },
    })),

  loadTabConfig: (modelKey) =>
    set((state) => {
      const config = state.tabConfigs[modelKey] ?? state.tabConfigs.custom
      return {
        simConfig: config,
      }
    }),
}))
