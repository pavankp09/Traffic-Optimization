import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useConfigStore } from '../store/configStore'
import { useSimulationStore } from '../store/simulationStore'
import HelpPopover from './HelpPopover'
import RequiredFieldGuard from './RequiredFieldGuard'
import { FALLBACK_PRESETS, PRESET_GROUP_LABELS, PRESET_GROUP_ORDER } from '../constants/presetCatalog'
import type { SimConfig, AdverseConfig, Preset, PresetSummary } from '../types'

// Section tab definitions
const SECTIONS = [
  { id: 'J', label: 'Scenario Packs', group: 'Start Here', hint: 'Choose city/time/event presets' },
  { id: 'A', label: 'Road Layout', group: 'Core Setup', hint: 'Intersection geometry and lanes' },
  { id: 'B', label: 'Traffic Demand', group: 'Core Setup', hint: 'Volume, pattern and arrivals' },
  { id: 'C', label: 'Vehicle Distribution', group: 'Core Setup', hint: 'Fleet mix percentages' },
  { id: 'D', label: 'Signal Timing', group: 'Control Logic', hint: 'Phases and cycle controls' },
  { id: 'E', label: 'RL Training', group: 'Control Logic', hint: 'Algorithm and reward settings' },
  { id: 'F', label: 'Runtime Engine', group: 'Control Logic', hint: 'Speed and warm-up parameters' },
  { id: 'G', label: 'Baseline Targets', group: 'Benchmarks', hint: 'Comparison reference values' },
  { id: 'H', label: 'Camera Input', group: 'Data & Risk', hint: 'RTSP and detection confidence' },
  { id: 'I', label: 'Incident & Risk', group: 'Data & Risk', hint: 'Failure and adverse settings' },
]

// Shared field components
function FormRow({
  label,
  help,
  required,
  children,
}: {
  label: string
  help: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400 flex items-center">
        {label}
        <HelpPopover text={help} />
        {required && <span className="ml-1 text-red-400 text-xs">*</span>}
      </label>
      {required ? (
        <RequiredFieldGuard required>{children}</RequiredFieldGuard>
      ) : (
        children
      )}
    </div>
  )
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <input
      type="number"
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  )
}

function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`relative w-12 h-6 rounded-full transition-colors ${value ? 'bg-cyan-500' : 'bg-gray-600'}`}
      onClick={() => onChange(!value)}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${value ? 'translate-x-6' : 'translate-x-0'}`}
      />
    </button>
  )
}

// Section A: Intersection Type
function SectionA({
  simConfig,
  updateSimConfig,
}: {
  simConfig: SimConfig
  updateSimConfig: (u: Partial<SimConfig>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormRow
        label="Intersection Type"
        help="Road geometry — 4-way cross is most common in Hyderabad"
        required
      >
        <SelectInput
          value={simConfig.intersection_type}
          onChange={(v) =>
            updateSimConfig({ intersection_type: v as SimConfig['intersection_type'] })
          }
          options={[
            { value: 'four_way', label: '4-Way Cross' },
            { value: 'four_way_free_left', label: '4-Way (Free Left)' },
            { value: 't_junction', label: 'T-Junction' },
            { value: 't_junction_free_left', label: 'T-Junction (Free Left)' },
            { value: 'y_junction', label: 'Y-Junction' },
            { value: 'six_arm', label: '6-Arm Complex' },
            { value: 'roundabout', label: 'Roundabout' },
            { value: 'roundabout_free_left', label: 'Roundabout (Free Left)' },
          ]}
        />
      </FormRow>
      <FormRow
        label="Lanes per Arm"
        help="Number of lanes per approach (1-5). Hyderabad major roads: 3-4 lanes"
        required
      >
        <NumberInput
          value={simConfig.n_lanes}
          onChange={(v) => updateSimConfig({ n_lanes: v })}
          min={1}
          max={5}
        />
      </FormRow>
    </div>
  )
}

// Section B: Traffic Demand
function SectionB({
  simConfig,
  updateSimConfig,
}: {
  simConfig: SimConfig
  updateSimConfig: (u: Partial<SimConfig>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormRow
        label="Total Volume (vph)"
        help="Total vehicles per hour entering the intersection from all arms. Hyderabad peak: 1500-2500 vph"
        required
      >
        <NumberInput
          value={simConfig.total_vph}
          onChange={(v) => updateSimConfig({ total_vph: v })}
          min={50}
          max={5000}
        />
      </FormRow>
      <FormRow
        label="Traffic Pattern"
        help="How demand is distributed over the simulation period. Morning/evening peaks reflect Hyderabad commute patterns"
      >
        <SelectInput
          value={simConfig.traffic_pattern}
          onChange={(v) =>
            updateSimConfig({ traffic_pattern: v as SimConfig['traffic_pattern'] })
          }
          options={[
            { value: 'uniform', label: 'Uniform' },
            { value: 'morning_peak', label: 'Morning Peak (8-10 AM)' },
            { value: 'evening_peak', label: 'Evening Peak (6-9 PM)' },
            { value: 'bidirectional', label: 'Bidirectional' },
            { value: 'random', label: 'Random' },
          ]}
        />
      </FormRow>
      <FormRow
        label="Arrival Distribution"
        help="Statistical model for vehicle arrival times. Poisson is most realistic for urban traffic"
      >
        <SelectInput
          value={simConfig.arrival_distribution}
          onChange={(v) =>
            updateSimConfig({ arrival_distribution: v as SimConfig['arrival_distribution'] })
          }
          options={[
            { value: 'poisson', label: 'Poisson (Recommended)' },
            { value: 'weibull', label: 'Weibull' },
            { value: 'uniform', label: 'Uniform' },
          ]}
        />
      </FormRow>
      <FormRow
        label="Simulation Duration (s)"
        help="How long each episode runs in simulated time. 3600s = 1 hour is standard"
        required
      >
        <NumberInput
          value={simConfig.simulation_duration_s}
          onChange={(v) => updateSimConfig({ simulation_duration_s: v })}
          min={60}
          max={7200}
          step={60}
        />
      </FormRow>
    </div>
  )
}

// Vehicle mix field definitions
const VEHICLE_MIX_FIELDS: Array<[keyof SimConfig, string, string]> = [
  ['pct_car', 'Cars (%)', 'Standard passenger cars — most common in Hyderabad urban areas'],
  ['pct_two_wheeler', 'Two-Wheelers (%)', 'Motorcycles and scooters — 40-50% of Hyderabad traffic'],
  ['pct_ev_scooter', 'EV Scooters (%)', 'Electric two-wheelers — growing segment, Ola/Ather etc.'],
  ['pct_auto_rickshaw', 'Auto Rickshaws (%)', 'Three-wheelers — dominant in old city and local routes'],
  ['pct_e_rickshaw', 'E-Rickshaws (%)', 'Electric three-wheelers — last-mile connectivity'],
  ['pct_cab', 'Cabs (%)', 'Taxi/app-based cabs — Uber, Ola, Rapido'],
  ['pct_delivery_bike', 'Delivery Bikes (%)', 'Food/parcel delivery two-wheelers — Swiggy, Zomato, etc.'],
  ['pct_tsrtc_bus', 'TSRTC Buses (%)', 'Telangana State Road Transport Corporation buses'],
  ['pct_school_bus', 'School Buses (%)', 'School/college buses — spike 8-9 AM, 4-5 PM'],
  ['pct_truck', 'Trucks (%)', 'Heavy goods vehicles — restricted hours in city core'],
]

// Section C: Vehicle Mix
function SectionC({
  simConfig,
  updateSimConfig,
}: {
  simConfig: SimConfig
  updateSimConfig: (u: Partial<SimConfig>) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Percentage mix must sum to 100%. Default reflects Hyderabad GHMC survey data.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {VEHICLE_MIX_FIELDS.map(([key, label, help]) => (
          <FormRow key={key as string} label={label} help={help}>
            <NumberInput
              value={(simConfig[key] as number) ?? 0}
              onChange={(v) => updateSimConfig({ [key]: v } as Partial<SimConfig>)}
              min={0}
              max={100}
            />
          </FormRow>
        ))}
      </div>
    </div>
  )
}

// Section D: Signal Phases
function SectionD({
  simConfig,
  updateSimConfig,
}: {
  simConfig: SimConfig
  updateSimConfig: (u: Partial<SimConfig>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormRow
        label="Number of Phases"
        help="Signal phases — Hyderabad standard 5-phase includes U-turn phase"
        required
      >
        <NumberInput
          value={simConfig.n_phases}
          onChange={(v) => updateSimConfig({ n_phases: v })}
          min={2}
          max={8}
        />
      </FormRow>
      <FormRow
        label="Min Green Time (s)"
        help="Minimum green duration per phase. GHMC standard: 15s minimum"
        required
      >
        <NumberInput
          value={simConfig.phase_min_green_s}
          onChange={(v) => updateSimConfig({ phase_min_green_s: v })}
          min={5}
          max={60}
        />
      </FormRow>
      <FormRow
        label="Max Green Time (s)"
        help="Maximum green duration per phase. Prevents one direction monopolizing green"
      >
        <NumberInput
          value={simConfig.phase_max_green_s}
          onChange={(v) => updateSimConfig({ phase_max_green_s: v })}
          min={30}
          max={180}
        />
      </FormRow>
      <FormRow
        label="Yellow Time (s)"
        help="Amber/transition time between phases. GHMC standard: 4 seconds"
      >
        <NumberInput
          value={simConfig.yellow_time_s}
          onChange={(v) => updateSimConfig({ yellow_time_s: v })}
          min={2}
          max={8}
        />
      </FormRow>
      <FormRow
        label="All-Red Time (s)"
        help="Safety clearance interval (all red). GHMC standard: 2 seconds"
      >
        <NumberInput
          value={simConfig.all_red_time_s}
          onChange={(v) => updateSimConfig({ all_red_time_s: v })}
          min={0}
          max={5}
        />
      </FormRow>
      <FormRow
        label="Cycle Length (s)"
        help="Total signal cycle duration. Webster optimal: 60-120s for Hyderabad volumes"
      >
        <NumberInput
          value={simConfig.cycle_length_s}
          onChange={(v) => updateSimConfig({ cycle_length_s: v })}
          min={30}
          max={300}
        />
      </FormRow>
    </div>
  )
}

// Section E: RL Parameters
function SectionE({
  simConfig,
  updateSimConfig,
}: {
  simConfig: SimConfig
  updateSimConfig: (u: Partial<SimConfig>) => void
}) {
  return (
    <div className="space-y-4">
      {/* Hyperparameters */}
      <div>
        <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">1. Network Hyperparameters</h5>
        <div className="grid grid-cols-2 gap-3">
          <FormRow
            label="RL Algorithm"
            help="Reinforcement learning algorithm. PPO is state-of-the-art for traffic control"
          >
            <SelectInput
              value={simConfig.rl_algorithm}
              onChange={(v) => updateSimConfig({ rl_algorithm: v })}
              options={[
                { value: 'PPO', label: 'PPO (Recommended)' },
                { value: 'A2C', label: 'A2C' },
                { value: 'DQN', label: 'DQN (Discrete)' },
              ]}
            />
          </FormRow>
          <FormRow
            label="Total Timesteps"
            help="Training steps. 500k is default — more = better but slower. Quick demo: 80k"
            required
          >
            <NumberInput
              value={simConfig.total_timesteps}
              onChange={(v) => updateSimConfig({ total_timesteps: v })}
              min={1000}
              max={5000000}
              step={1000}
            />
          </FormRow>
          <FormRow
            label="Learning Rate"
            help="Model learning rate. Default 0.0003 is well-tuned for traffic environments"
            required
          >
            <input
              type="number"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
              value={simConfig.learning_rate}
              min={0.00001}
              max={0.01}
              step={0.00001}
              onChange={(e) => updateSimConfig({ learning_rate: Number(e.target.value) })}
            />
          </FormRow>
          <FormRow
            label="Discount Factor (Gamma)"
            help="Model discount factor (0.80 - 0.999). Determines horizon of future rewards"
            required
          >
            <input
              type="number"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none"
              value={simConfig.discount_factor ?? 0.99}
              min={0.8}
              max={0.999}
              step={0.001}
              onChange={(e) => updateSimConfig({ discount_factor: Number(e.target.value) })}
            />
          </FormRow>
          <FormRow
            label="Hidden Layer Size"
            help="Neurons per hidden layer in policy MLP. Larger model fits complex dynamics but is slower"
          >
            <SelectInput
              value={String(simConfig.hidden_layer_size ?? 64)}
              onChange={(v) => updateSimConfig({ hidden_layer_size: Number(v) })}
              options={[
                { value: '32', label: '32 (Light)' },
                { value: '64', label: '64 (Balanced)' },
                { value: '128', label: '128 (Large)' },
                { value: '256', label: '256 (Heavy)' },
              ]}
            />
          </FormRow>
        </div>
      </div>

      {/* Dynamic Reward Weight Adjusters */}
      <div className="border-t border-gray-800 pt-3">
        <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">2. RL Brain Reward Weights</h5>
        <p className="text-[10px] text-gray-500 mb-3 leading-snug">
          Custom shape the agent's optimization priorities. Tune weight values to change model behavior.
        </p>
        <div className="space-y-3">
          {/* Queue Length Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400 flex items-center">
                Queue Penalty Weight
                <HelpPopover text="How heavily the agent is penalized for accumulated queue lengths at approaches." />
              </span>
              <span className="font-mono text-cyan-400 font-bold">{(simConfig.reward_wt_queue ?? 1.0).toFixed(1)}</span>
            </div>
            <input
              type="range"
              className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              min="0.0"
              max="5.0"
              step="0.1"
              value={simConfig.reward_wt_queue ?? 1.0}
              onChange={(e) => updateSimConfig({ reward_wt_queue: Number(e.target.value) })}
            />
          </div>

          {/* Wait Time Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400 flex items-center">
                Wait Time Penalty Weight
                <HelpPopover text="How heavily the agent is penalized for vehicle waiting delay." />
              </span>
              <span className="font-mono text-cyan-400 font-bold">{(simConfig.reward_wt_wait ?? 0.5).toFixed(1)}</span>
            </div>
            <input
              type="range"
              className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              min="0.0"
              max="5.0"
              step="0.1"
              value={simConfig.reward_wt_wait ?? 0.5}
              onChange={(e) => updateSimConfig({ reward_wt_wait: Number(e.target.value) })}
            />
          </div>

          {/* Throughput Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400 flex items-center">
                Throughput Bonus Weight
                <HelpPopover text="Clearance bonus paid to the agent for every vehicle successfully traversing the intersection." />
              </span>
              <span className="font-mono text-cyan-400 font-bold">{(simConfig.reward_wt_throughput ?? 2.0).toFixed(1)}</span>
            </div>
            <input
              type="range"
              className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              min="0.0"
              max="5.0"
              step="0.1"
              value={simConfig.reward_wt_throughput ?? 2.0}
              onChange={(e) => updateSimConfig({ reward_wt_throughput: Number(e.target.value) })}
            />
          </div>

          {/* Collision Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400 flex items-center">
                Collision Penalty Weight
                <HelpPopover text="Severe penalty applied to the agent if any collisions occur due to risky phase decisions." />
              </span>
              <span className="font-mono text-cyan-400 font-bold">{(simConfig.reward_wt_collision ?? 1.5).toFixed(1)}</span>
            </div>
            <input
              type="range"
              className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              min="0.0"
              max="5.0"
              step="0.1"
              value={simConfig.reward_wt_collision ?? 1.5}
              onChange={(e) => updateSimConfig({ reward_wt_collision: Number(e.target.value) })}
            />
          </div>

          {/* Phase Switch Slider */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400 flex items-center">
                Phase Switch Penalty Weight
                <HelpPopover text="Penalty applied for changing signal phases needlessly, forcing the agent to learn stable greens." />
              </span>
              <span className="font-mono text-cyan-400 font-bold">{(simConfig.reward_wt_switch ?? 0.15).toFixed(2)}</span>
            </div>
            <input
              type="range"
              className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              min="0.0"
              max="1.0"
              step="0.05"
              value={simConfig.reward_wt_switch ?? 0.15}
              onChange={(e) => updateSimConfig({ reward_wt_switch: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// Section F: Simulation Engine
function SectionF({
  simConfig,
  updateSimConfig,
}: {
  simConfig: SimConfig
  updateSimConfig: (u: Partial<SimConfig>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormRow
        label="Simulation Speed"
        help="How many sim seconds per real second. 10x is default — higher = faster training"
      >
        <NumberInput
          value={simConfig.sim_speed_multiplier}
          onChange={(v) => updateSimConfig({ sim_speed_multiplier: v })}
          min={1}
          max={100}
        />
      </FormRow>
      <FormRow
        label="Warm-Up Period (s)"
        help="Time before metrics collection starts — lets traffic reach steady state"
      >
        <NumberInput
          value={simConfig.warm_up_s}
          onChange={(v) => updateSimConfig({ warm_up_s: v })}
          min={0}
          max={600}
          step={30}
        />
      </FormRow>
    </div>
  )
}

// Section G: Baseline Controller Benchmarks
function SectionG({
  simConfig,
  updateSimConfig,
}: {
  simConfig: SimConfig
  updateSimConfig: (u: Partial<SimConfig>) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-gray-400 text-xs p-3.5 bg-amber-500/5 border border-amber-500/20 rounded-2xl space-y-2 leading-relaxed shadow-md">
        <p className="font-extrabold text-amber-400 flex items-center gap-1.5 uppercase font-mono tracking-wider">
          Baseline Benchmarks
        </p>
        <p className="font-medium text-gray-300">
          Configure the comparative benchmarks for the pre-timed Webster controller.
          These static values serve as the calibration yardstick for all RL models.
        </p>
      </div>

      <div className="space-y-4">
        {/* Wait Delay Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-bold flex items-center">
              Avg Wait Delay
              <HelpPopover text="The calibrated benchmark average stopped wait time for the pre-timed baseline cycle." />
            </span>
            <span className="font-mono text-amber-400 font-black text-sm">{(simConfig.baseline_wait_delay ?? 85)}s</span>
          </div>
          <input
            type="range"
            className="w-full h-1 bg-gray-850 rounded-lg appearance-none cursor-pointer accent-amber-500"
            min="10"
            max="200"
            step="5"
            value={simConfig.baseline_wait_delay ?? 85}
            onChange={(e) => updateSimConfig({ baseline_wait_delay: Number(e.target.value) })}
          />
        </div>

        {/* Throughput Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-bold flex items-center">
              Flow Throughput
              <HelpPopover text="The benchmark baseline intersection vehicle throughput per hour." />
            </span>
            <span className="font-mono text-amber-400 font-black text-sm">{(simConfig.baseline_throughput ?? 440)} vph</span>
          </div>
          <input
            type="range"
            className="w-full h-1 bg-gray-850 rounded-lg appearance-none cursor-pointer accent-amber-500"
            min="50"
            max="1000"
            step="10"
            value={simConfig.baseline_throughput ?? 440}
            onChange={(e) => updateSimConfig({ baseline_throughput: Number(e.target.value) })}
          />
        </div>

        {/* Green Utilisation Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-bold flex items-center">
              Green Signal Utilisation
              <HelpPopover text="The percentage of green light duration actively discharged under fixed cycles." />
            </span>
            <span className="font-mono text-amber-400 font-black text-sm">{(simConfig.baseline_green_util ?? 85)}%</span>
          </div>
          <input
            type="range"
            className="w-full h-1 bg-gray-850 rounded-lg appearance-none cursor-pointer accent-amber-500"
            min="10"
            max="100"
            step="1"
            value={simConfig.baseline_green_util ?? 85}
            onChange={(e) => updateSimConfig({ baseline_green_util: Number(e.target.value) })}
          />
        </div>

        {/* Signal Coordination Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400 font-bold flex items-center">
              Signal Coordination
              <HelpPopover text="The synchronization efficiency rating of vehicle arrival platoons in fixed cycles." />
            </span>
            <span className="font-mono text-amber-400 font-black text-sm">{(simConfig.baseline_coordination ?? 83)}%</span>
          </div>
          <input
            type="range"
            className="w-full h-1 bg-gray-850 rounded-lg appearance-none cursor-pointer accent-amber-500"
            min="10"
            max="100"
            step="1"
            value={simConfig.baseline_coordination ?? 83}
            onChange={(e) => updateSimConfig({ baseline_coordination: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  )
}

// Section H: Camera / Vision
function SectionH({
  simConfig,
  updateSimConfig,
}: {
  simConfig: SimConfig
  updateSimConfig: (u: Partial<SimConfig>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormRow
        label="Enable RTSP Camera"
        help="Use live CCTV/IP camera feed for real vehicle counts instead of synthetic demand"
      >
        <Toggle
          value={simConfig.enable_rtsp}
          onChange={(v) => updateSimConfig({ enable_rtsp: v })}
        />
      </FormRow>
      {simConfig.enable_rtsp && (
        <>
          <FormRow
            label="RTSP URL"
            help="Camera stream URL. Format: rtsp://user:pass@ip:port/stream"
          >
            <input
              type="text"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:border-cyan-500 focus:outline-none font-mono"
              value={simConfig.rtsp_url}
              placeholder="rtsp://192.168.1.100:554/stream"
              onChange={(e) => updateSimConfig({ rtsp_url: e.target.value })}
            />
          </FormRow>
          <FormRow
            label="YOLO Confidence"
            help="Detection confidence threshold (0.1-0.9). Lower = more detections, more noise"
          >
            <NumberInput
              value={simConfig.yolo_confidence}
              onChange={(v) => updateSimConfig({ yolo_confidence: v })}
              min={0.1}
              max={0.95}
              step={0.05}
            />
          </FormRow>
        </>
      )}
    </div>
  )
}

// Section I: Adverse Scenarios
function SectionI({
  adverseConfig,
  updateAdverseConfig,
}: {
  adverseConfig: AdverseConfig
  updateAdverseConfig: (u: Partial<AdverseConfig>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormRow
        label="Collision Probability"
        help="Probability of collision per step. 0.02 = realistic Hyderabad urban traffic"
      >
        <NumberInput
          value={adverseConfig.collision_probability}
          onChange={(v) => updateAdverseConfig({ collision_probability: v })}
          min={0}
          max={0.5}
          step={0.01}
        />
      </FormRow>
      <FormRow
        label="Rear-End Risk Factor"
        help="Multiplier for rear-end collision probability in dense traffic. 0=none, 1=maximum"
      >
        <NumberInput
          value={adverseConfig.rear_end_risk_factor}
          onChange={(v) => updateAdverseConfig({ rear_end_risk_factor: v })}
          min={0}
          max={1}
          step={0.05}
        />
      </FormRow>
      <FormRow
        label="Red Light Run Probability"
        help="Fraction of vehicles that run red lights per cycle. Hyderabad: ~5-8%"
      >
        <NumberInput
          value={adverseConfig.red_light_run_prob}
          onChange={(v) => updateAdverseConfig({ red_light_run_prob: v })}
          min={0}
          max={0.3}
          step={0.01}
        />
      </FormRow>
      <FormRow
        label="Signal Failure Probability"
        help="Probability of signal controller failure per episode. 0.01 = one failure per ~100 cycles"
      >
        <NumberInput
          value={adverseConfig.signal_failure_prob}
          onChange={(v) => updateAdverseConfig({ signal_failure_prob: v })}
          min={0}
          max={0.5}
          step={0.01}
        />
      </FormRow>
      <FormRow
        label="Signal Failure Mode"
        help="What happens when signal fails: stuck_red causes backlog, stuck_green causes conflict risk"
      >
        <SelectInput
          value={adverseConfig.signal_failure_mode}
          onChange={(v) =>
            updateAdverseConfig({ signal_failure_mode: v as AdverseConfig['signal_failure_mode'] })
          }
          options={[
            { value: 'stuck_red', label: 'Stuck Red' },
            { value: 'stuck_green', label: 'Stuck Green' },
            { value: 'flicker', label: 'Flicker' },
            { value: 'off', label: 'Off (Dark signal)' },
          ]}
        />
      </FormRow>
      <FormRow
        label="Enable Waterlogging"
        help="Monsoon flooding simulation — reduces road capacity and causes slowdowns"
      >
        <Toggle
          value={adverseConfig.waterlogging_enabled}
          onChange={(v) => updateAdverseConfig({ waterlogging_enabled: v })}
        />
      </FormRow>
      {adverseConfig.waterlogging_enabled && (
        <FormRow
          label="Waterlogging Severity"
          help="0 = puddles, 1 = severe flooding. Affects speed limits and lane availability"
        >
          <NumberInput
            value={adverseConfig.waterlogging_severity}
            onChange={(v) => updateAdverseConfig({ waterlogging_severity: v })}
            min={0}
            max={1}
            step={0.1}
          />
        </FormRow>
      )}
      <FormRow
        label="Enable VIP Convoy"
        help="Simulates VIP/political convoy causing lane closures and priority green time"
      >
        <Toggle
          value={adverseConfig.vip_convoy_enabled}
          onChange={(v) => updateAdverseConfig({ vip_convoy_enabled: v })}
        />
      </FormRow>
      <FormRow
        label="Camera Dropout Probability"
        help="Probability of camera feed loss per step — tests system resilience"
      >
        <NumberInput
          value={adverseConfig.camera_dropout_prob}
          onChange={(v) => updateAdverseConfig({ camera_dropout_prob: v })}
          min={0}
          max={0.5}
          step={0.05}
        />
      </FormRow>
      <FormRow
        label="Sensor Noise (std dev)"
        help="Gaussian noise added to sensor readings — simulates imperfect vehicle detection"
      >
        <NumberInput
          value={adverseConfig.sensor_noise_std}
          onChange={(v) => updateAdverseConfig({ sensor_noise_std: v })}
          min={0}
          max={0.5}
          step={0.05}
        />
      </FormRow>
    </div>
  )
}

function SectionJ({
  activePresetName,
  onOpenStudio,
}: {
  activePresetName: string
  onOpenStudio: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/35 p-3">
        <h5 className="text-xs font-semibold text-slate-200">Scenario Packs</h5>
        <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
          Start with a preset pack (time of day, location, events, risk).
          Then fine-tune values in other configuration sections.
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
        <p className="text-[11px] text-slate-400">Current Scenario</p>
        <p className="mt-1 text-sm text-slate-100 font-medium truncate">{activePresetName}</p>
      </div>

      <button
        type="button"
        className="w-full bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg text-xs font-semibold transition-colors"
        onClick={onOpenStudio}
      >
        Open Scenario Pack Selector
      </button>
    </div>
  )
}

function ScenarioStudioModal({
  open,
  loading,
  infoLoading,
  groupedPresets,
  presetDetails,
  activePresetId,
  simConfig,
  adverseConfig,
  updateSimConfig,
  updateAdverseConfig,
  onClose,
  onSelectPreset,
}: {
  open: boolean
  loading: boolean
  infoLoading: boolean
  groupedPresets: Record<string, PresetSummary[]>
  presetDetails: Record<string, Preset>
  activePresetId: string
  simConfig: SimConfig
  adverseConfig: AdverseConfig
  updateSimConfig: (u: Partial<SimConfig>) => void
  updateAdverseConfig: (u: Partial<AdverseConfig>) => void
  onClose: () => void
  onSelectPreset: (presetId: string) => void
}) {
  const availableGroups: string[] = PRESET_GROUP_ORDER.filter((groupKey) => (groupedPresets[groupKey] ?? []).length > 0)
  const quickPresets = [
    { id: 'vp_offpeak', scale: 'Very Light', name: 'Very Light - Off Peak', vehicles: 2000, durationMin: 60, pattern: 'uniform', canvas: 'regular' },
    { id: 'l_bike', scale: 'Light', name: 'Light - Bike City', vehicles: 5000, durationMin: 60, pattern: 'uniform', canvas: 'regular' },
    { id: 'l_mixed', scale: 'Light', name: 'Light - Mixed', vehicles: 5000, durationMin: 60, pattern: 'uniform', canvas: 'regular' },
    { id: 'm_standard', scale: 'Medium', name: 'Medium - Standard', vehicles: 10000, durationMin: 60, pattern: 'uniform', canvas: 'regular' },
    { id: 'm_car', scale: 'Medium', name: 'Medium - Car Heavy', vehicles: 10000, durationMin: 60, pattern: 'uniform', canvas: 'regular' },
    { id: 'm_commercial', scale: 'Medium', name: 'Medium - Commercial', vehicles: 8000, durationMin: 60, pattern: 'bidirectional', canvas: 'regular' },
    { id: 'h_peak', scale: 'Heavy', name: 'Heavy - Peak Hour', vehicles: 15000, durationMin: 60, pattern: 'morning_peak', canvas: 'large' },
    { id: 'h_tw', scale: 'Heavy', name: 'Heavy - Two-Wheeler Surge', vehicles: 15000, durationMin: 60, pattern: 'evening_peak', canvas: 'large' },
    { id: 'h_commercial', scale: 'Heavy', name: 'Heavy - Commercial Rush', vehicles: 15000, durationMin: 60, pattern: 'bidirectional', canvas: 'large' },
    { id: 'x_max', scale: 'Extreme', name: 'Extreme - Max Load', vehicles: 15000, durationMin: 60, pattern: 'random', canvas: 'large' },
  ] as const

  const [mode, setMode] = useState<'preset' | 'custom'>('preset')
  const [activeGroup, setActiveGroup] = useState<string>(availableGroups[0] ?? 'A_time_of_day')
  const [showAll, setShowAll] = useState(false)
  const [presetScale, setPresetScale] = useState<'All' | 'Very Light' | 'Light' | 'Medium' | 'Heavy' | 'Extreme' | 'Custom'>('All')
  const [activeQuickPresetId, setActiveQuickPresetId] = useState<string>('m_standard')
  const [intersectionChoice, setIntersectionChoice] = useState<'4-road' | '5-road' | 'custom-json'>('4-road')
  const [trafficVolume, setTrafficVolume] = useState<number>(Number(simConfig.total_vph ?? 1000))
  const [spawnMultipliers, setSpawnMultipliers] = useState({ bike: 4, car: 3, auto: 2, bus: 1.5, truck: 1 })
  const [durationChoice, setDurationChoice] = useState<'15' | '30' | '60' | '90' | 'custom'>('15')
  const [customDurationMin, setCustomDurationMin] = useState<number>(15)
  const [drivingBehavior, setDrivingBehavior] = useState<'safe' | 'medium' | 'aggressive' | 'very_aggressive'>('medium')
  const [canvasSize, setCanvasSize] = useState<'regular' | 'large'>('large')
  const [customJsonText, setCustomJsonText] = useState<string>('{}')

  useEffect(() => {
    if (!open) return
    const first = availableGroups[0] ?? 'A_time_of_day'
    if (!availableGroups.includes(activeGroup)) {
      setActiveGroup(first)
    }
  }, [open, availableGroups, activeGroup])

  useEffect(() => {
    if (!open) return
    setMode('preset')
    setShowAll(false)
    setPresetScale('All')
    setIntersectionChoice('4-road')
    setTrafficVolume(Number(simConfig.total_vph ?? 1000))
    setDurationChoice('15')
    setCustomDurationMin(15)
    setDrivingBehavior('medium')
    setCanvasSize('large')
    setCustomJsonText('{}')
    setSpawnMultipliers({ bike: 4, car: 3, auto: 2, bus: 1.5, truck: 1 })
  }, [open])

  useEffect(() => {
    setShowAll(false)
  }, [activeGroup])

  const getInfoChips = (preset: PresetSummary) => {
    const detail = presetDetails[preset.id]
    const simCfg = detail?.sim_config ?? {}
    const advCfg = detail?.adverse_config ?? {}
    const volume = Number((simCfg.total_vph as number) ?? (simCfg.traffic_volume_vph as number) ?? 0)
    const pattern = String((simCfg.traffic_pattern as string) ?? '').replace('_', ' ')
    const collisionProb = Number((advCfg.collision_probability as number) ?? 0)

    const chips: string[] = []
    if (volume > 0) chips.push(`${volume} vph`)
    if (pattern) chips.push(pattern)
    if (collisionProb >= 0.08) chips.push('high risk')
    else if (collisionProb >= 0.03) chips.push('medium risk')
    else if (collisionProb > 0) chips.push('low risk')
    return chips
  }

  const getDescription = (preset: PresetSummary) => {
    const detail = presetDetails[preset.id]
    return detail?.description || preset.description || `Scenario pack for ${PRESET_GROUP_LABELS[preset.group] ?? 'traffic'}`
  }

  if (!open) return null

  const groupOptions = groupedPresets[activeGroup] ?? []
  const visibleOptions = showAll ? groupOptions : groupOptions.slice(0, 6)
  const hiddenCount = Math.max(0, groupOptions.length - visibleOptions.length)
  const visibleQuickPresets = quickPresets.filter((preset) => presetScale === 'All' ? true : preset.scale === presetScale)

  const applyQuickPreset = (presetId: string) => {
    const preset = quickPresets.find((item) => item.id === presetId)
    if (!preset) return
    setActiveQuickPresetId(presetId)
    setTrafficVolume(preset.vehicles)
    setDurationChoice('60')
    setCustomDurationMin(preset.durationMin)
    setCanvasSize(preset.canvas)
  }

  const applyCustomScenario = () => {
    const targetDuration = durationChoice === 'custom' ? Math.max(5, customDurationMin) : Number(durationChoice)
    const multiplierMap = {
      pct_two_wheeler: spawnMultipliers.bike,
      pct_car: spawnMultipliers.car,
      pct_auto_rickshaw: spawnMultipliers.auto,
      pct_tsrtc_bus: spawnMultipliers.bus,
      pct_truck: spawnMultipliers.truck,
    } as const

    const weighted = Object.entries(multiplierMap).map(([key, mult]) => {
      const base = Number((simConfig[key as keyof SimConfig] as number) ?? 1)
      return { key, value: Math.max(0.01, base * mult) }
    })
    const sum = weighted.reduce((acc, item) => acc + item.value, 0)
    const normalized = weighted.reduce<Record<string, number>>((acc, item) => {
      acc[item.key] = Number(((item.value / sum) * 100).toFixed(2))
      return acc
    }, {})

    const intersectionUpdates: Partial<SimConfig> = intersectionChoice === '5-road'
      ? { intersection_type: 'six_arm', n_lanes: Math.max(3, Number(simConfig.n_lanes ?? 3)) }
      : { intersection_type: 'four_way' }

    let customJsonUpdates: Partial<SimConfig> = {}
    if (intersectionChoice === 'custom-json') {
      try {
        const parsed = JSON.parse(customJsonText)
        if (parsed && typeof parsed === 'object') {
          customJsonUpdates = parsed as Partial<SimConfig>
        }
      } catch {
        // Keep silent in UI; we still apply normal custom selections.
      }
    }

    updateSimConfig({
      ...intersectionUpdates,
      ...normalized,
      ...customJsonUpdates,
      total_vph: Math.round(trafficVolume),
      simulation_duration_s: targetDuration * 60,
      traffic_pattern: simConfig.traffic_pattern ?? 'uniform',
      canvas_size: canvasSize,
      canvas_width: canvasSize === 'large' ? 1600 : 1110,
      canvas_height: canvasSize === 'large' ? 1000 : 800,
      driver_behavior: drivingBehavior,
      spawn_mult_bike: spawnMultipliers.bike,
      spawn_mult_car: spawnMultipliers.car,
      spawn_mult_auto: spawnMultipliers.auto,
      spawn_mult_bus: spawnMultipliers.bus,
      spawn_mult_truck: spawnMultipliers.truck,
    })

    updateAdverseConfig({
      rear_end_risk_factor:
        drivingBehavior === 'safe' ? 0.05 :
        drivingBehavior === 'medium' ? 0.1 :
        drivingBehavior === 'aggressive' ? 0.2 : 0.3,
    })
  }

  // Traffic density colour palette used throughout the modal
  const SCALE_COLORS: Record<string, string> = {
    'All': '#64748b',
    'Very Light': '#4ade80',
    'Light': '#86efac',
    'Medium': '#facc15',
    'Heavy': '#f97316',
    'Extreme': '#ef4444',
    'Custom': '#8fb8ce',
  }

  const scaleColor = (scale: string) => SCALE_COLORS[scale] ?? '#64748b'

  const SectionHead = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">{children}</h4>
    </div>
  )

  const Card = ({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-all duration-200 ${
        active
          ? 'border-white/20 bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
      }`}
    >
      {children}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-lg flex items-center justify-center p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0d14] shadow-[0_40px_120px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] bg-[#0d1017] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#8fb8ce]/30 to-[#6e8fa8]/20 border border-white/[0.08] flex items-center justify-center">
              <svg viewBox="0 0 14 14" fill="none" className="w-3.5 h-3.5">
                <rect x="1" y="1" width="5" height="5" rx="1" fill="rgba(143,184,206,0.7)" />
                <rect x="8" y="1" width="5" height="5" rx="1" fill="rgba(143,184,206,0.4)" />
                <rect x="1" y="8" width="5" height="5" rx="1" fill="rgba(143,184,206,0.4)" />
                <rect x="8" y="8" width="5" height="5" rx="1" fill="rgba(143,184,206,0.25)" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 leading-none">Scenario Studio</h3>
              <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                {mode === 'preset' ? 'Select a scenario pack from the library' : 'Configure a custom simulation scenario'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#0b0f17] rounded-lg p-0.5 border border-white/[0.06]">
              {(['preset', 'custom'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`px-3 py-1 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wider transition-all ${
                    mode === m
                      ? 'bg-white/[0.08] text-slate-200 border border-white/[0.1]'
                      : 'text-slate-600 hover:text-slate-400'
                  }`}
                >
                  {m === 'preset' ? 'Presets' : 'Custom'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/[0.08] text-slate-500 hover:text-slate-200 hover:border-white/[0.16] transition-all text-base"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 custom-scrollbar p-4 space-y-3">
          {loading && <p className="text-[10px] text-slate-500 font-mono">Loading presets...</p>}

          {/* PRESET MODE */}
          {mode === 'preset' && (
            <>
              {/* Category selector */}
              <div className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.05] rounded-xl px-3 py-2.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-600 font-mono whitespace-nowrap">Category</span>
                <select
                  className="flex-1 bg-transparent border-none text-xs text-slate-300 focus:outline-none cursor-pointer"
                  value={activeGroup}
                  onChange={(e) => setActiveGroup(e.target.value)}
                >
                  {availableGroups.map((groupKey) => (
                    <option key={groupKey} value={groupKey} className="bg-[#0d1117]">
                      {PRESET_GROUP_LABELS[groupKey]}
                    </option>
                  ))}
                </select>
                <span className="text-[9px] text-slate-600 font-mono">{groupOptions.length} scenarios</span>
              </div>

              {/* Preset list */}
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                <SectionHead>{PRESET_GROUP_LABELS[activeGroup]}</SectionHead>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {visibleOptions.map((preset) => {
                    const isActive = activePresetId === preset.id
                    const chips = getInfoChips(preset)
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onSelectPreset(preset.id)}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-all duration-200 group ${
                          isActive
                            ? 'border-[#8fb8ce]/30 bg-[#8fb8ce]/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                            : 'border-white/[0.05] bg-white/[0.015] hover:border-white/[0.10] hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={`text-xs font-semibold leading-tight ${isActive ? 'text-slate-100' : 'text-slate-300'}`}>
                            {preset.name}
                          </span>
                          {isActive && (
                            <span className="w-4 h-4 rounded-full bg-[#8fb8ce]/20 border border-[#8fb8ce]/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#8fb8ce]" />
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1 font-mono">{getDescription(preset)}</p>
                        {chips.length > 0 && (
                          <div className="flex gap-1 mt-1.5">
                            {chips.slice(0, 2).map((chip) => (
                              <span key={chip} className="text-[8px] px-1.5 py-0.5 rounded-md border border-white/[0.08] text-slate-500 bg-white/[0.02] font-mono uppercase tracking-wider">
                                {chip}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="mt-2 text-[9px] font-mono text-slate-600 hover:text-slate-400 border border-white/[0.06] rounded-lg px-2.5 py-1 transition-colors"
                  >
                    {showAll ? '↑ Show fewer' : `↓ Show ${hiddenCount} more`}
                  </button>
                )}
              </div>
            </>
          )}

          {/* CUSTOM MODE */}
          {mode === 'custom' && (
            <>
              {/* Traffic Scale Filter Pills */}
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                <SectionHead>Traffic Scale</SectionHead>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {(['All', 'Very Light', 'Light', 'Medium', 'Heavy', 'Extreme', 'Custom'] as const).map((scale) => {
                    const isActive = presetScale === scale
                    const col = scaleColor(scale)
                    return (
                      <button
                        key={scale}
                        type="button"
                        onClick={() => setPresetScale(scale)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold uppercase tracking-wider transition-all border ${
                          isActive
                            ? 'border-white/[0.15] bg-white/[0.06] text-slate-200'
                            : 'border-white/[0.05] text-slate-600 hover:text-slate-400 hover:border-white/[0.09]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: isActive ? col : 'rgba(100,116,139,0.5)' }}
                          />
                          {scale}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Preset Cards Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {visibleQuickPresets.map((preset) => {
                    const isActive = activeQuickPresetId === preset.id
                    const col = scaleColor(preset.scale)
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyQuickPreset(preset.id)}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-all duration-200 relative overflow-hidden ${
                          isActive
                            ? 'border-white/[0.14] bg-white/[0.05]'
                            : 'border-white/[0.05] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.035]'
                        }`}
                      >
                        {/* Density accent bar */}
                        <div
                          className="absolute top-0 left-0 w-0.5 h-full rounded-full"
                          style={{ backgroundColor: isActive ? col : 'transparent' }}
                        />
                        <div className="pl-2">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span
                              className="text-[8px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md"
                              style={{
                                color: col,
                                backgroundColor: `${col}15`,
                                border: `1px solid ${col}30`,
                              }}
                            >
                              {preset.scale}
                            </span>
                          </div>
                          <div className={`text-[11px] font-semibold leading-tight ${isActive ? 'text-slate-100' : 'text-slate-300'}`}>
                            {preset.name.split(' - ').slice(1).join(' - ') || preset.name}
                          </div>
                          <div className="text-[9px] text-slate-600 font-mono mt-1 tabular-nums">
                            {preset.vehicles.toLocaleString()} veh &middot; {preset.durationMin}min &middot; {preset.canvas}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Intersection Type */}
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                <SectionHead>Intersection Type</SectionHead>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: '4-road', title: '4-Road', sub: 'Standard cross' },
                    { id: '5-road', title: '5-Road', sub: 'Complex arm' },
                    { id: 'custom-json', title: 'JSON', sub: 'Custom config' },
                  ].map((opt) => (
                    <Card key={opt.id} active={intersectionChoice === opt.id} onClick={() => setIntersectionChoice(opt.id as '4-road' | '5-road' | 'custom-json')}>
                      <div className={`text-xs font-semibold ${intersectionChoice === opt.id ? 'text-slate-100' : 'text-slate-400'}`}>{opt.title}</div>
                      <div className="text-[9px] text-slate-600 font-mono mt-0.5">{opt.sub}</div>
                    </Card>
                  ))}
                </div>
                {intersectionChoice === 'custom-json' && (
                  <textarea
                    className="w-full mt-2 bg-black/30 border border-white/[0.08] rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-white/[0.18] font-mono"
                    rows={3}
                    value={customJsonText}
                    onChange={(e) => setCustomJsonText(e.target.value)}
                  />
                )}
              </div>

              {/* Traffic Volume */}
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                <div className="flex items-center justify-between mb-3">
                  <SectionHead>Traffic Volume</SectionHead>
                  <span className="text-sm font-bold font-mono text-slate-200 tabular-nums">{Math.round(trafficVolume).toLocaleString()} <span className="text-[9px] text-slate-600">veh/hr</span></span>
                </div>
                <input type="range" min={100} max={50000} step={100} value={trafficVolume}
                  onChange={(e) => setTrafficVolume(Number(e.target.value))} className="studio-range w-full" />
                <div className="flex justify-between text-[9px] text-slate-700 font-mono mt-1.5">
                  <span>100</span><span>50,000</span>
                </div>
              </div>

              {/* Vehicle Spawn Multipliers */}
              <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                <div className="flex items-center justify-between mb-3">
                  <SectionHead>Spawn Rate Multipliers</SectionHead>
                  <button type="button" onClick={() => setSpawnMultipliers({ bike: 4, car: 3, auto: 2, bus: 1.5, truck: 1 })}
                    className="text-[9px] font-mono text-slate-600 hover:text-slate-400 border border-white/[0.06] rounded-md px-2 py-0.5 transition-colors">
                    Reset
                  </button>
                </div>
                <div className="space-y-2">
                  {[{ key: 'bike', label: 'Bike' }, { key: 'car', label: 'Car' }, { key: 'auto', label: 'Auto' }, { key: 'bus', label: 'Bus' }, { key: 'truck', label: 'Truck' }].map((row) => (
                    <div key={row.key} className="grid grid-cols-[48px_1fr_40px] items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-mono">{row.label}</span>
                      <input type="range" min={0} max={10} step={0.5}
                        value={spawnMultipliers[row.key as keyof typeof spawnMultipliers]}
                        onChange={(e) => setSpawnMultipliers((prev) => ({ ...prev, [row.key]: Number(e.target.value) }))}
                        className="studio-range w-full" />
                      <span className="text-[10px] text-slate-300 text-right font-mono font-bold tabular-nums">{spawnMultipliers[row.key as keyof typeof spawnMultipliers]}&times;</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Duration + Driving Behavior + Canvas in single row */}
              <div className="grid grid-cols-3 gap-2">
                {/* Duration */}
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                  <SectionHead>Duration</SectionHead>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[{ id: '15', label: '15m' }, { id: '30', label: '30m' }, { id: '60', label: '60m' }, { id: '90', label: '90m' }, { id: 'custom', label: 'Custom' }].map((opt) => (
                      <button key={opt.id} type="button" onClick={() => setDurationChoice(opt.id as '15' | '30' | '60' | '90' | 'custom')}
                        className={`rounded-lg border py-1.5 text-[10px] font-mono font-semibold transition-all ${
                          durationChoice === opt.id ? 'border-white/[0.16] bg-white/[0.06] text-slate-200' : 'border-white/[0.05] text-slate-600 hover:text-slate-400'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {durationChoice === 'custom' && (
                    <input type="number" min={5}
                      className="w-full mt-1.5 bg-black/30 border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none font-mono"
                      value={customDurationMin} onChange={(e) => setCustomDurationMin(Number(e.target.value))} />
                  )}
                </div>

                {/* Driving Behavior */}
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                  <SectionHead>Driving Mode</SectionHead>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[{ id: 'safe', label: 'Safe' }, { id: 'medium', label: 'Medium' }, { id: 'aggressive', label: 'Aggressive' }, { id: 'very_aggressive', label: 'V. Aggressive' }].map((opt) => (
                      <button key={opt.id} type="button" onClick={() => setDrivingBehavior(opt.id as 'safe' | 'medium' | 'aggressive' | 'very_aggressive')}
                        className={`rounded-lg border py-1.5 text-[9px] font-mono font-semibold transition-all leading-tight ${
                          drivingBehavior === opt.id ? 'border-white/[0.16] bg-white/[0.06] text-slate-200' : 'border-white/[0.05] text-slate-600 hover:text-slate-400'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Canvas Size */}
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                  <SectionHead>Canvas Size</SectionHead>
                  <div className="space-y-1.5">
                    {[{ id: 'regular', label: '1110 × 800', sub: 'Regular' }, { id: 'large', label: '1600 × 1000', sub: 'Large' }].map((opt) => (
                      <button key={opt.id} type="button" onClick={() => setCanvasSize(opt.id as 'regular' | 'large')}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left transition-all ${
                          canvasSize === opt.id ? 'border-white/[0.16] bg-white/[0.06]' : 'border-white/[0.05] hover:border-white/[0.10]'
                        }`}>
                        <div className={`text-[10px] font-mono font-semibold ${canvasSize === opt.id ? 'text-slate-200' : 'text-slate-500'}`}>{opt.label}</div>
                        <div className="text-[8px] text-slate-700 font-mono">{opt.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Apply button */}
              <button
                type="button"
                onClick={applyCustomScenario}
                className="w-full bg-white/[0.07] hover:bg-white/[0.10] border border-white/[0.12] hover:border-white/[0.20] text-slate-200 font-semibold py-2.5 rounded-xl text-xs font-mono uppercase tracking-widest transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              >
                Apply Configuration
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SimConfigPanel({ onUpdateSim, initialSection }: { onUpdateSim?: () => void; initialSection?: string }) {
  const selectedModelSingle = useSimulationStore((s) => s.selectedModelSingle)
  const isRunning = useSimulationStore((s) => s.isRunning)
  const [activeSection, setActiveSection] = useState(initialSection ?? (selectedModelSingle === 'custom' ? 'J' : 'J'))
  const [isScenarioStudioOpen, setIsScenarioStudioOpen] = useState(false)
  const [presets, setPresets] = useState<PresetSummary[]>([])
  const [isPresetLoading, setIsPresetLoading] = useState(false)
  const [isPresetInfoLoading, setIsPresetInfoLoading] = useState(false)
  const [presetDetailsMap, setPresetDetailsMap] = useState<Record<string, Preset>>({})
  const { simConfig, adverseConfig, activePreset, updateSimConfig, updateAdverseConfig, loadPreset } = useConfigStore()

  useEffect(() => {
    if (selectedModelSingle === 'custom') {
      setActiveSection('J')
    }
  }, [selectedModelSingle])

  useEffect(() => {
    fetch('/api/presets')
      .then((r) => r.json())
      .then((res) => {
        const data: PresetSummary[] = Array.isArray(res) ? res : (res?.data ?? [])
        setPresets(data.length ? data : FALLBACK_PRESETS)
      })
      .catch(() => setPresets(FALLBACK_PRESETS))
  }, [])

  useEffect(() => {
    if (!isScenarioStudioOpen || presets.length === 0) return
    const missing = presets.filter((p) => !presetDetailsMap[p.id]).map((p) => p.id)
    if (!missing.length) return

    let mounted = true
    setIsPresetInfoLoading(true)
    Promise.all(
      missing.map(async (id) => {
        try {
          const res = await fetch(`/api/presets/${id}`).then((r) => r.json())
          return [id, (res?.data ?? null) as Preset | null] as const
        } catch {
          return [id, null] as const
        }
      })
    ).then((pairs) => {
      if (!mounted) return
      setPresetDetailsMap((prev) => {
        const next = { ...prev }
        pairs.forEach(([id, preset]) => {
          if (preset) next[id] = preset
        })
        return next
      })
    }).finally(() => {
      if (mounted) setIsPresetInfoLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [isScenarioStudioOpen, presets, presetDetailsMap])

  const groupedPresets: Record<string, PresetSummary[]> = {}
  presets.forEach((p) => {
    if (!groupedPresets[p.group]) groupedPresets[p.group] = []
    groupedPresets[p.group].push(p)
  })

  const buildLocalFallbackPreset = (summary: PresetSummary): Preset => {
    const baseSim: Partial<SimConfig> = {
      total_vph: 900,
      traffic_pattern: 'uniform',
      simulation_duration_s: 1800,
      sim_speed_multiplier: 20,
    }
    const baseAdverse: Partial<AdverseConfig> = {}

    if (summary.group === 'A_time_of_day') {
      const byId: Record<string, Partial<SimConfig>> = {
        hyd_rush_am: { total_vph: 1800, traffic_pattern: 'morning_peak' },
        hyd_rush_pm: { total_vph: 2000, traffic_pattern: 'evening_peak' },
        hyd_normal: { total_vph: 900, traffic_pattern: 'uniform' },
        hyd_night: { total_vph: 350, traffic_pattern: 'uniform' },
        hyd_midnight: { total_vph: 220, traffic_pattern: 'uniform' },
        hyd_weekend: { total_vph: 700, traffic_pattern: 'bidirectional' },
        hyd_early_morning: { total_vph: 500, traffic_pattern: 'uniform' },
      }
      Object.assign(baseSim, byId[summary.id] ?? {})
    } else if (summary.group === 'B_location') {
      const byId: Record<string, Partial<SimConfig>> = {
        hyd_hitec_city: { total_vph: 1600, traffic_pattern: 'morning_peak' },
        hyd_old_city: { total_vph: 1200, traffic_pattern: 'bidirectional' },
        hyd_sr_nagar: { total_vph: 700, traffic_pattern: 'morning_peak' },
        hyd_lb_nagar: { total_vph: 1400, traffic_pattern: 'bidirectional' },
        hyd_secunderabad: { total_vph: 1500, traffic_pattern: 'morning_peak' },
        hyd_gachibowli: { total_vph: 1650, traffic_pattern: 'evening_peak' },
      }
      Object.assign(baseSim, byId[summary.id] ?? {})
    } else if (summary.group === 'C_vehicle_mix') {
      const mixById: Record<string, Partial<SimConfig>> = {
        mix_ev_dominated: { pct_ev_scooter: 25, pct_two_wheeler: 30, pct_car: 20 },
        mix_heavy_vehicles: { pct_truck: 12, pct_tsrtc_bus: 10, pct_car: 24, pct_two_wheeler: 18 },
        mix_two_wheelers: { pct_two_wheeler: 45, pct_ev_scooter: 18, pct_car: 20 },
        mix_cars_only: { pct_car: 70, pct_two_wheeler: 10, pct_ev_scooter: 5 },
        mix_bus_priority: { pct_tsrtc_bus: 20, pct_school_bus: 8, pct_car: 26, pct_two_wheeler: 16 },
      }
      Object.assign(baseSim, mixById[summary.id] ?? {})
    } else if (summary.group === 'D_seasonal') {
      if (summary.id === 'season_monsoon') {
        Object.assign(baseAdverse, { waterlogging_enabled: true, waterlogging_severity: 0.5 })
      } else if (summary.id === 'season_winter_fog') {
        Object.assign(baseAdverse, { sensor_noise_std: 0.2 })
      }
    } else if (summary.group === 'E_events') {
      const eventById: Record<string, Partial<SimConfig>> = {
        event_cricket_match: { total_vph: 2200, traffic_pattern: 'evening_peak' },
        event_political_rally: { total_vph: 1800, traffic_pattern: 'random' },
        event_school_exam: { total_vph: 1400, traffic_pattern: 'morning_peak' },
        event_market_day: { total_vph: 1600, traffic_pattern: 'bidirectional' },
      }
      Object.assign(baseSim, eventById[summary.id] ?? {})
    } else if (summary.group === 'F_adverse') {
      if (summary.id === 'adverse_high_collision') Object.assign(baseAdverse, { collision_probability: 0.1 })
      if (summary.id === 'adverse_signal_failure') Object.assign(baseAdverse, { signal_failure_prob: 0.08, signal_failure_mode: 'stuck_red' })
      if (summary.id === 'adverse_heavy_rain') Object.assign(baseAdverse, { waterlogging_enabled: true, waterlogging_severity: 0.8 })
      if (summary.id === 'adverse_vip_convoy') Object.assign(baseAdverse, { vip_convoy_enabled: true, vip_convoy_frequency_hr: 1.0 })
    } else if (summary.group === 'G_research') {
      const researchById: Record<string, Partial<SimConfig>> = {
        research_stress_test: { total_vph: 3000, traffic_pattern: 'morning_peak' },
        research_minimal: { total_vph: 120, traffic_pattern: 'uniform' },
        research_5arm: { intersection_type: 'six_arm', n_lanes: 3, total_vph: 1000 },
        research_roundabout: { intersection_type: 'roundabout', n_phases: 2, total_vph: 800 },
      }
      Object.assign(baseSim, researchById[summary.id] ?? {})
    }

    return {
      id: summary.id,
      name: summary.name,
      group: summary.group,
      description: summary.description,
      tags: summary.tags,
      sim_config: baseSim,
      adverse_config: baseAdverse,
    }
  }

  const handleSelectScenarioPreset = async (presetId: string) => {
    setIsPresetLoading(true)
    try {
      const summary = presets.find((p) => p.id === presetId) ?? FALLBACK_PRESETS.find((p) => p.id === presetId)
      let preset: Preset | null = null

      try {
        const res = await fetch(`/api/presets/${presetId}`).then((r) => r.json())
        preset = (res?.data ?? null) as Preset | null
      } catch {
        preset = null
      }

      if (!preset && summary) {
        preset = buildLocalFallbackPreset(summary)
      }

      if (preset) loadPreset(preset)
    } finally {
      setIsPresetLoading(false)
      setIsScenarioStudioOpen(false)
    }
  }

  const sectionsByGroup = SECTIONS.reduce<Record<string, typeof SECTIONS>>((acc, section) => {
    if (!acc[section.group]) acc[section.group] = []
    acc[section.group].push(section)
    return acc
  }, {})

  const sectionOrder = SECTIONS.map((section) => section.id)
  const activeIndex = sectionOrder.indexOf(activeSection)
  const activeSectionMeta = SECTIONS.find((section) => section.id === activeSection)
  const isApplyDisabled = activeSection === 'J' && !activePreset

  return (
    <div className="flex flex-col gap-3 pb-2">
      {/* Section navigator */}
      <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 space-y-2.5">
        {/* Label + step counter */}
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500 font-mono">Section</span>
          <span className="text-[8px] font-mono text-slate-700 tabular-nums">{activeIndex + 1} / {sectionOrder.length}</span>
        </div>

        <select
          className="w-full bg-[#0a0d14] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 focus:border-[#8fb8ce]/40 focus:outline-none transition-colors"
          value={activeSection}
          onChange={(e) => setActiveSection(e.target.value)}
        >
          {Object.entries(sectionsByGroup).map(([group, sections]) => (
            <optgroup key={group} label={group}>
              {sections.map((section) => (
                <option key={section.id} value={section.id} className="bg-[#0a0d14]">
                  {section.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Prev / Next + hint */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="px-2.5 py-1 text-[9px] rounded-lg border border-white/[0.08] text-slate-500 hover:text-slate-300 hover:border-white/[0.16] disabled:opacity-25 disabled:cursor-not-allowed transition-all font-mono"
            onClick={() => setActiveSection(sectionOrder[Math.max(0, activeIndex - 1)])}
            disabled={activeIndex <= 0}
          >← Prev</button>
          <button
            type="button"
            className="px-2.5 py-1 text-[9px] rounded-lg border border-white/[0.08] text-slate-500 hover:text-slate-300 hover:border-white/[0.16] disabled:opacity-25 disabled:cursor-not-allowed transition-all font-mono"
            onClick={() => setActiveSection(sectionOrder[Math.min(sectionOrder.length - 1, activeIndex + 1)])}
            disabled={activeIndex >= sectionOrder.length - 1}
          >Next →</button>
          <span className="text-[9px] text-slate-700 truncate font-mono italic">{activeSectionMeta?.hint}</span>
        </div>

        {/* Step progress dots */}
        <div className="flex items-center gap-0.5 pt-0.5">
          {sectionOrder.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={`h-1 rounded-full transition-all duration-200 ${
                i === activeIndex ? 'bg-[#8fb8ce]/70 w-4' : 'bg-white/[0.08] w-1.5 hover:bg-white/[0.18]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Warning banner when simulation is running */}
      {isRunning && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl p-2 px-3 text-[10px] font-mono leading-relaxed mb-2.5">
          ⚠ Settings are locked while simulation is active.
        </div>
      )}

      {/* Section content — single-column override so fields fit in the narrow sidebar */}
      <div className={`[&_.grid-cols-2]:!grid-cols-1 ${isRunning ? 'pointer-events-none opacity-45 select-none' : ''}`}>
        {activeSection === 'A' && (
          <SectionA simConfig={simConfig} updateSimConfig={updateSimConfig} />
        )}
        {activeSection === 'B' && (
          <SectionB simConfig={simConfig} updateSimConfig={updateSimConfig} />
        )}
        {activeSection === 'C' && (
          <SectionC simConfig={simConfig} updateSimConfig={updateSimConfig} />
        )}
        {activeSection === 'D' && (
          <SectionD simConfig={simConfig} updateSimConfig={updateSimConfig} />
        )}
        {activeSection === 'E' && (
          <SectionE simConfig={simConfig} updateSimConfig={updateSimConfig} />
        )}
        {activeSection === 'F' && (
          <SectionF simConfig={simConfig} updateSimConfig={updateSimConfig} />
        )}
        {activeSection === 'G' && (
          <SectionG simConfig={simConfig} updateSimConfig={updateSimConfig} />
        )}
        {activeSection === 'H' && (
          <SectionH simConfig={simConfig} updateSimConfig={updateSimConfig} />
        )}
        {activeSection === 'I' && (
          <SectionI adverseConfig={adverseConfig} updateAdverseConfig={updateAdverseConfig} />
        )}
        {activeSection === 'J' && (
          <SectionJ
            activePresetName={activePreset?.name ?? 'No preset selected'}
            onOpenStudio={() => setIsScenarioStudioOpen(true)}
          />
        )}
      </div>

      <ScenarioStudioModal
        open={isScenarioStudioOpen}
        loading={isPresetLoading}
        infoLoading={isPresetInfoLoading}
        groupedPresets={groupedPresets}
        presetDetails={presetDetailsMap}
        activePresetId={activePreset?.id ?? ''}
        simConfig={simConfig}
        adverseConfig={adverseConfig}
        updateSimConfig={updateSimConfig}
        updateAdverseConfig={updateAdverseConfig}
        onClose={() => setIsScenarioStudioOpen(false)}
        onSelectPreset={handleSelectScenarioPreset}
      />

      {/* Apply button */}
      {onUpdateSim && (
        <button
          className={`w-full mt-1 py-2.5 rounded-xl text-[11px] font-semibold tracking-wide transition-all flex items-center justify-center gap-2 border ${
            isApplyDisabled || isRunning
              ? 'bg-white/[0.02] border-white/[0.05] text-slate-600 cursor-not-allowed'
              : 'bg-[#8fb8ce]/[0.09] border-[#8fb8ce]/25 text-[#8fb8ce]/90 hover:bg-[#8fb8ce]/[0.14] hover:border-[#8fb8ce]/40 hover:text-[#8fb8ce]'
          }`}
          onClick={onUpdateSim}
          disabled={isApplyDisabled || isRunning}
          title={isRunning ? 'Simulation running - config locked' : isApplyDisabled ? 'Select a scenario preset first' : ''}
        >
          {activeSection === 'E'
            ? 'Apply Training Settings'
            : activeSection === 'J'
              ? 'Apply Scenario and Update'
              : 'Update Simulation'}
        </button>
      )}
    </div>
  )
}
