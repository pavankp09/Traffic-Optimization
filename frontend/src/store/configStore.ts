import { create } from 'zustand'
import { useSimulationStore } from './simulationStore'
import type { SimConfig, AdverseConfig, Preset } from '../types'

// Default values matching Python DEFAULT_SIM_CONFIG
const DEFAULT_SIM_CONFIG: SimConfig = {
  intersection_type: 'four_way',
  n_lanes: 3,
  u_turn_phase: false,
  turn_distribution_mode: 'arm',

  arm_turn_ratios: {
    N: { straight: 55, left: 15, right: 20, uturn: 5, mid_uturn: 5 },
    S: { straight: 55, left: 15, right: 20, uturn: 5, mid_uturn: 5 },
    E: { straight: 55, left: 15, right: 20, uturn: 5, mid_uturn: 5 },
    W: { straight: 55, left: 15, right: 20, uturn: 5, mid_uturn: 5 }
  },
  lane_turn_ratios: {
    N: [
      { straight: 0.4, left: 0.0, right: 0.4, uturn: 0.1, mid_uturn: 0.1 },
      { straight: 0.8, left: 0.0, right: 0.2, uturn: 0.0, mid_uturn: 0.0 },
      { straight: 0.4, left: 0.6, right: 0.0, uturn: 0.0, mid_uturn: 0.0 }
    ],
    S: [
      { straight: 0.4, left: 0.0, right: 0.4, uturn: 0.1, mid_uturn: 0.1 },
      { straight: 0.8, left: 0.0, right: 0.2, uturn: 0.0, mid_uturn: 0.0 },
      { straight: 0.4, left: 0.6, right: 0.0, uturn: 0.0, mid_uturn: 0.0 }
    ],
    E: [
      { straight: 0.4, left: 0.0, right: 0.4, uturn: 0.1, mid_uturn: 0.1 },
      { straight: 0.8, left: 0.0, right: 0.2, uturn: 0.0, mid_uturn: 0.0 },
      { straight: 0.4, left: 0.6, right: 0.0, uturn: 0.0, mid_uturn: 0.0 }
    ],
    W: [
      { straight: 0.4, left: 0.0, right: 0.4, uturn: 0.1, mid_uturn: 0.1 },
      { straight: 0.8, left: 0.0, right: 0.2, uturn: 0.0, mid_uturn: 0.0 },
      { straight: 0.4, left: 0.6, right: 0.0, uturn: 0.0, mid_uturn: 0.0 }
    ]
  },

  total_vph: 3000,

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
  total_timesteps: 20000,
  training_episodes: 500,
  learning_rate: 0.0003,
  ppo_epochs: 250,
  early_stopping: false,
  hidden_layer_size: 128,
  discount_factor: 0.99,
  reward_wt_queue: 1.0,
  reward_wt_wait: 0.5,
  reward_wt_throughput: 2.0,
  reward_wt_collision: 1.5,
  reward_wt_pedestrian: 0.8,
  reward_wt_emergency: 0.5,
  reward_wt_switch: 0.5,
  simulation_duration_s: 1800,
  warm_up_s: 60,
  sim_speed_multiplier: 5,
  enable_rtsp: false,
  rtsp_url: '',
  yolo_confidence: 0.5,
  baseline_wait_delay: 85,
  baseline_throughput: 440,
  baseline_green_util: 85,
  baseline_coordination: 83,
  same_as_baseline: false,
  training_mode: 'stage1',
}

const HYD_TEST_LOCATION_PRESET: Preset = {
  id: 'hyd_test_location',
  name: 'Hyderabad Test Location',
  group: 'B_location',
  description: 'Test location containing only location coordinates',
  tags: ['test_location', 'hyderabad'],
  sim_config: {
    osm_lat: 17.3850,
    osm_lon: 78.4867,
    u_turn_phase: false,
    turn_distribution_mode: 'arm',

    arm_turn_ratios: {
      N: { straight: 55, left: 15, right: 20, uturn: 5, mid_uturn: 5 },
      S: { straight: 55, left: 15, right: 20, uturn: 5, mid_uturn: 5 },
      E: { straight: 55, left: 15, right: 20, uturn: 5, mid_uturn: 5 },
      W: { straight: 55, left: 15, right: 20, uturn: 5, mid_uturn: 5 }
    },
    lane_turn_ratios: {
      N: [
        { straight: 0.35, left: 0.0, right: 0.45, uturn: 0.10, mid_uturn: 0.10 },
        { straight: 0.80, left: 0.0, right: 0.20, uturn: 0.0, mid_uturn: 0.0 },
        { straight: 0.40, left: 0.60, right: 0.0, uturn: 0.0, mid_uturn: 0.0 }
      ],
      S: [
        { straight: 0.35, left: 0.0, right: 0.45, uturn: 0.10, mid_uturn: 0.10 },
        { straight: 0.80, left: 0.0, right: 0.20, uturn: 0.0, mid_uturn: 0.0 },
        { straight: 0.40, left: 0.60, right: 0.0, uturn: 0.0, mid_uturn: 0.0 }
      ],
      E: [
        { straight: 0.35, left: 0.0, right: 0.45, uturn: 0.10, mid_uturn: 0.10 },
        { straight: 0.80, left: 0.0, right: 0.20, uturn: 0.0, mid_uturn: 0.0 },
        { straight: 0.40, left: 0.60, right: 0.0, uturn: 0.0, mid_uturn: 0.0 }
      ],
      W: [
        { straight: 0.35, left: 0.0, right: 0.45, uturn: 0.10, mid_uturn: 0.10 },
        { straight: 0.80, left: 0.0, right: 0.20, uturn: 0.0, mid_uturn: 0.0 },
        { straight: 0.40, left: 0.60, right: 0.0, uturn: 0.0, mid_uturn: 0.0 }
      ]
    },

    total_vph: 15000,

    simulation_duration_s: 3600,
    canvas_size: 'large',
    canvas_width: 1600,
    canvas_height: 1000,
    traffic_pattern: 'morning_peak',
    spawn_mult_bike: 5.0,
    spawn_mult_car: 6.0,
    spawn_mult_auto: 3.0,
    spawn_mult_bus: 2.0,
    spawn_mult_truck: 1.0,
    pct_two_wheeler: 44.5,
    pct_car: 40.0,
    pct_auto_rickshaw: 10.0,
    pct_tsrtc_bus: 4.4,
    pct_truck: 1.1,
    pct_ev_scooter: 0,
    pct_e_rickshaw: 0,
    pct_cab: 0,
    pct_delivery_bike: 0,
    pct_school_bus: 0,
    baseline_wait_delay: 780,
    baseline_throughput: 1950,
    baseline_green_util: 95,
    baseline_coordination: 45,
  },
  adverse_config: {},
}

const HYD_TEST_LOCATION_SIM_CONFIG: SimConfig = {
  ...DEFAULT_SIM_CONFIG,
  osm_lat: 17.3850,
  osm_lon: 78.4867,
  total_vph: 15000,
  simulation_duration_s: 600,
  canvas_size: 'large',
  canvas_width: 1600,
  canvas_height: 1000,
  traffic_pattern: 'morning_peak',
  spawn_mult_bike: 5.0,
  spawn_mult_car: 6.0,
  spawn_mult_auto: 3.0,
  spawn_mult_bus: 2.0,
  spawn_mult_truck: 1.0,
  pct_two_wheeler: 44.5,
  pct_car: 40.0,
  pct_auto_rickshaw: 10.0,
  pct_tsrtc_bus: 4.4,
  pct_truck: 1.1,
  pct_ev_scooter: 0,
  pct_e_rickshaw: 0,
  pct_cab: 0,
  pct_delivery_bike: 0,
  pct_school_bus: 0,
  baseline_wait_delay: 780,
  baseline_throughput: 1950,
  baseline_green_util: 95,
  baseline_coordination: 45,
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
    ...HYD_TEST_LOCATION_SIM_CONFIG,
    rl_algorithm: 'Fixed-Time',
    learning_rate: 0,
    discount_factor: 0,
    hidden_layer_size: 0,
    ppo_epochs: 0,
  },
  baseline_fixed: {
    ...HYD_TEST_LOCATION_SIM_CONFIG,
    rl_algorithm: 'Fixed-Time',
    learning_rate: 0,
    discount_factor: 0,
    hidden_layer_size: 0,
    ppo_epochs: 0,
  },
  rl1: {
    ...HYD_TEST_LOCATION_SIM_CONFIG,
    rl_algorithm: 'PPO',
    learning_rate: 0.0003,
    discount_factor: 0.99,
    hidden_layer_size: 128,
    ppo_epochs: 250,
  },
  rl2: {
    ...HYD_TEST_LOCATION_SIM_CONFIG,
    rl_algorithm: 'DQN',
    learning_rate: 0.0001,
    discount_factor: 0.95,
    hidden_layer_size: 128,
  },
  rl3: {
    ...HYD_TEST_LOCATION_SIM_CONFIG,
    rl_algorithm: 'SAC',
    learning_rate: 0.0003,
    discount_factor: 0.98,
    hidden_layer_size: 256,
  },
  rl4: {
    ...HYD_TEST_LOCATION_SIM_CONFIG,
    rl_algorithm: 'A2C',
    learning_rate: 0.0007,
    discount_factor: 0.99,
    hidden_layer_size: 32,
  },
  custom: {
    ...HYD_TEST_LOCATION_SIM_CONFIG,
    rl_algorithm: 'PPO',
    learning_rate: 0.0003,
    discount_factor: 0.99,
    hidden_layer_size: 128,
    ppo_epochs: 250,
  },
}

export const useConfigStore = create<ConfigState>((set) => ({
  simConfig: HYD_TEST_LOCATION_SIM_CONFIG,
  adverseConfig: DEFAULT_ADVERSE_CONFIG,
  activePreset: HYD_TEST_LOCATION_PRESET,
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
        total_vph: volume,
        n_lanes: (preset.sim_config as any).n_lanes || (preset.sim_config as any).lanes_per_arm || 3,
        rl_algorithm: (preset.sim_config as any).rl_algorithm || (preset.sim_config as any).algorithm || 'PPO',
        warm_up_s: (preset.sim_config as any).warm_up_s || (preset.sim_config as any).warm_up_seconds || 60,
        baseline_wait_delay: calculatedWait,
        baseline_throughput: calculatedTput,
        baseline_green_util: calculatedUtil,
        baseline_coordination: calculatedCoord,
      }

      const activeModel = useSimulationStore.getState().selectedModelSingle
      const sameAsBaseline = presetSimConfig.same_as_baseline ?? state.simConfig.same_as_baseline
      const newTabConfigs = { ...state.tabConfigs, [activeModel]: presetSimConfig }

      if (activeModel !== 'baseline' && sameAsBaseline) {
        newTabConfigs.baseline = {
          ...newTabConfigs.baseline,
          ...presetSimConfig,
          rl_algorithm: newTabConfigs.baseline?.rl_algorithm || 'Fixed-Time',
        }
      }

      return {
        simConfig: presetSimConfig,
        adverseConfig: { ...DEFAULT_ADVERSE_CONFIG, ...(preset.adverse_config as Partial<AdverseConfig>) },
        activePreset: preset,
        tabConfigs: newTabConfigs,
        isDirty: false,
      }
    }),

  resetToDefaults: () =>
    set({
      simConfig: HYD_TEST_LOCATION_SIM_CONFIG,
      adverseConfig: DEFAULT_ADVERSE_CONFIG,
      activePreset: HYD_TEST_LOCATION_PRESET,
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
