import { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import type { ReactNode } from 'react'
import { useConfigStore } from '../store/configStore'
import { useSimulationStore } from '../store/simulationStore'
import HelpPopover from './HelpPopover'
import type { SimConfig, AdverseConfig } from '../types'

// ─── Nav Section Definitions ─────────────────────────────────────────────────
const NAV_GROUPS = [
  {
    id: 'start',
    label: 'Start Here',
    sections: [
      { id: 'J', label: 'Scenario Packs', hint: 'City presets & custom builder', icon: '🗺️' },
    ],
  },
  {
    id: 'core',
    label: 'Core Setup',
    sections: [
      { id: 'A', label: 'Road Layout', hint: 'Intersection geometry & lanes', icon: '🛣️' },
      { id: 'B', label: 'Traffic Demand', hint: 'Volume, pattern & arrivals', icon: '🚗' },
      { id: 'C', label: 'Vehicle Mix', hint: 'Fleet type percentages', icon: '🚌' },
    ],
  },
  {
    id: 'control',
    label: 'Control Logic',
    sections: [
      { id: 'D', label: 'Signal Timing', hint: 'Phases & cycle controls', icon: '🚦' },
      { id: 'E', label: 'RL Training', hint: 'Algorithm & reward weights', icon: '🤖' },
      { id: 'F', label: 'Runtime Engine', hint: 'Speed & warm-up settings', icon: '⚡' },
    ],
  },
  {
    id: 'benchmarks',
    label: 'Benchmarks',
    sections: [
      { id: 'G', label: 'Baseline Targets', hint: 'Comparison reference values', icon: '🎯' },
    ],
  },
  {
    id: 'risk',
    label: 'Data & Risk',
    sections: [
      { id: 'H', label: 'Camera Input', hint: 'RTSP & detection confidence', icon: '📹' },
      { id: 'I', label: 'Incident & Risk', hint: 'Failure & adverse settings', icon: '⚠️' },
    ],
  },
]

const ALL_SECTIONS = NAV_GROUPS.flatMap((g) => g.sections)

const QUICK_PRESETS = [
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

// ─── Shared Primitives ────────────────────────────────────────────────────────
function FormRow({ label, help, required, children }: {
  label: string; help: string; required?: boolean; children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11.5px] text-slate-400 flex items-center gap-1.5 font-semibold tracking-wide">
        {label}
        <HelpPopover text={help} />
        {required && <span className="text-red-400 text-xs">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full bg-[#050508] border border-white/[0.06] rounded-xl px-3 py-2.5 text-[12.5px] text-slate-200 focus:border-white/20 focus:outline-none hover:border-white/[0.10] transition-all placeholder-slate-600 font-mono font-medium shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.5)]'
const selectCls = inputCls

function NumberInput({ value, onChange, min, max, step = 1 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <input type="number" className={inputCls} value={value} min={min} max={max} step={step}
      onChange={(e) => onChange(Number(e.target.value))} />
  )
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]
}) {
  return (
    <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value} className="bg-[#0c0c0e] text-slate-200">{o.label}</option>)}
    </select>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button"
      className="relative w-11.5 h-6.5 rounded-full transition-all duration-300 p-0.5 border"
      style={{
        backgroundColor: value ? '#8fb8ce' : '#070b15',
        borderColor: value ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
      }}
      onClick={() => onChange(!value)}>
      <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

function SliderRow({ label, help, value, onChange, min, max, step, display, accent }: {
  label: string; help: string; value: number; onChange: (v: number) => void
  min: number; max: number; step: number; display: string; accent?: 'amber' | 'theme'
}) {
  const percentage = ((value - min) / (max - min)) * 100

  return (
    <div className="space-y-2 group">
      <div className="flex justify-between items-center">
        <span className="text-[11.5px] text-slate-400 font-semibold flex items-center gap-1 group-hover:text-slate-300 transition-colors">
          {label}<HelpPopover text={help} />
        </span>
        <span className="font-mono text-[13px] tracking-wide tabular-nums font-bold"
          style={{ color: accent === 'amber' ? '#fbbf24' : '#8fb8ce' }}>
          {display}
        </span>
      </div>
      <div className="relative h-2 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.03]">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-75"
          style={{
            width: `${percentage}%`,
            background: accent === 'amber'
              ? '#f59e0b'
              : '#8fb8ce',
          }}
        />
        <input type="range" className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
          min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))} />
      </div>
    </div>
  )
}

// ─── Section Content Components ───────────────────────────────────────────────
function SectionA({ simConfig, updateSimConfig }: { simConfig: SimConfig; updateSimConfig: (u: Partial<SimConfig>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-5">
      <FormRow label="Intersection Type" help="Road geometry — 4-way cross is most common in Hyderabad" required>
        <SelectInput value={simConfig.intersection_type} onChange={(v) => updateSimConfig({ intersection_type: v as SimConfig['intersection_type'] })}
          options={[
            { value: 'four_way', label: '4-Way Cross' },
            { value: 'four_way_free_left', label: '4-Way (Free Left)' },
            { value: 't_junction', label: 'T-Junction' },
            { value: 't_junction_free_left', label: 'T-Junction (Free Left)' },
            { value: 'y_junction', label: 'Y-Junction' },
            { value: 'six_arm', label: '6-Arm Complex' },
            { value: 'roundabout', label: 'Roundabout' },
            { value: 'roundabout_free_left', label: 'Roundabout (Free Left)' },
          ]} />
      </FormRow>
      <FormRow label="Lanes per Arm" help="Number of lanes per approach (1-5). Hyderabad major roads: 3-4 lanes" required>
        <NumberInput value={simConfig.n_lanes} onChange={(v) => updateSimConfig({ n_lanes: v })} min={1} max={5} />
      </FormRow>
    </div>
  )
}

function SectionB({ simConfig, updateSimConfig }: { simConfig: SimConfig; updateSimConfig: (u: Partial<SimConfig>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-5">
      <FormRow label="Total Volume (vph)" help="Total vehicles per hour entering the intersection. Hyderabad peak: 1500–2500 vph" required>
        <NumberInput value={simConfig.total_vph} onChange={(v) => updateSimConfig({ total_vph: v })} min={50} max={5000} />
      </FormRow>
      <FormRow label="Traffic Pattern" help="How demand is distributed over the simulation period. Morning/evening peaks reflect Hyderabad commute patterns">
        <SelectInput value={simConfig.traffic_pattern} onChange={(v) => updateSimConfig({ traffic_pattern: v as SimConfig['traffic_pattern'] })}
          options={[
            { value: 'uniform', label: 'Uniform' },
            { value: 'morning_peak', label: 'Morning Peak (8–10 AM)' },
            { value: 'evening_peak', label: 'Evening Peak (6–9 PM)' },
            { value: 'bidirectional', label: 'Bidirectional' },
            { value: 'random', label: 'Random' },
          ]} />
      </FormRow>
      <FormRow label="Arrival Distribution" help="Statistical model for vehicle arrival times. Poisson is most realistic for urban traffic">
        <SelectInput value={simConfig.arrival_distribution} onChange={(v) => updateSimConfig({ arrival_distribution: v as SimConfig['arrival_distribution'] })}
          options={[
            { value: 'poisson', label: 'Poisson (Recommended)' },
            { value: 'weibull', label: 'Weibull' },
            { value: 'uniform', label: 'Uniform' },
          ]} />
      </FormRow>
      <FormRow label="Simulation Duration (s)" help="How long each episode runs in simulated time. 3600s = 1 hour is standard" required>
        <NumberInput value={simConfig.simulation_duration_s} onChange={(v) => updateSimConfig({ simulation_duration_s: v })} min={60} max={7200} step={60} />
      </FormRow>
    </div>
  )
}

const VEHICLE_MIX_FIELDS: Array<[keyof SimConfig, string, string]> = [
  ['pct_car', 'Cars', 'Standard passenger cars — most common in Hyderabad urban areas'],
  ['pct_two_wheeler', 'Two-Wheelers', 'Motorcycles and scooters — 40–50% of Hyderabad traffic'],
  ['pct_ev_scooter', 'EV Scooters', 'Electric two-wheelers — growing segment (Ola/Ather)'],
  ['pct_auto_rickshaw', 'Auto Rickshaws', 'Three-wheelers — dominant in old city and local routes'],
  ['pct_e_rickshaw', 'E-Rickshaws', 'Electric three-wheelers — last-mile connectivity'],
  ['pct_cab', 'Cabs', 'Taxi/app-based cabs — Uber, Ola, Rapido'],
  ['pct_delivery_bike', 'Delivery Bikes', 'Food/parcel delivery two-wheelers — Swiggy, Zomato'],
  ['pct_tsrtc_bus', 'TSRTC Buses', 'Telangana State Road Transport Corporation buses'],
  ['pct_school_bus', 'School Buses', 'School/college buses — spike 8–9 AM, 4–5 PM'],
  ['pct_truck', 'Trucks', 'Heavy goods vehicles — restricted hours in city core'],
]

function SectionC({ simConfig, updateSimConfig }: { simConfig: SimConfig; updateSimConfig: (u: Partial<SimConfig>) => void }) {
  const total = VEHICLE_MIX_FIELDS.reduce((s, [k]) => s + ((simConfig[k] as number) ?? 0), 0)
  const isOver = total > 100
  const isUnder = total < 100
  return (
    <div className="space-y-5">
      <div className={`flex items-center justify-between text-xs rounded-xl px-4 py-2.5 border transition-all duration-300 ${
        total === 100
          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
          : 'bg-amber-500/5 border-amber-500/20 text-amber-400'
      }`}>
        <span className="font-mono font-bold tracking-wide flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${total === 100 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          {isOver ? `Over by ${total - 100}%` : isUnder ? `Under by ${100 - total}% remaining` : '✓ Total allocation is perfect'}
        </span>
        <span className="font-mono font-black tabular-nums text-xl">{total}%</span>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        {VEHICLE_MIX_FIELDS.map(([key, label, help]) => (
          <div key={key as string} className="space-y-2 group">
            <div className="flex justify-between items-center">
              <span className="text-[11.5px] text-slate-400 font-semibold flex items-center gap-1 group-hover:text-slate-300 transition-colors">
                {label}<HelpPopover text={help} />
              </span>
              <span className="font-mono font-bold text-[#8fb8ce] text-[12.5px]">{simConfig[key] as number}%</span>
            </div>
            <div className="relative h-2 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.03]">
              <div className="absolute inset-y-0 left-0 rounded-full transition-all bg-[#8fb8ce]"
                style={{ width: `${Math.min(100, (simConfig[key] as number))}%` }} />
              <input type="range" className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                min={0} max={100} step={1} value={simConfig[key] as number}
                onChange={(e) => updateSimConfig({ [key]: Number(e.target.value) } as Partial<SimConfig>)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionD({ simConfig, updateSimConfig }: { simConfig: SimConfig; updateSimConfig: (u: Partial<SimConfig>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-5">
      <FormRow label="Number of Phases" help="Signal phases — Hyderabad standard 5-phase includes U-turn phase" required>
        <NumberInput value={simConfig.n_phases} onChange={(v) => updateSimConfig({ n_phases: v })} min={2} max={8} />
      </FormRow>
      <FormRow label="Min Green Time (s)" help="Minimum green duration per phase. GHMC standard: 15s minimum" required>
        <NumberInput value={simConfig.phase_min_green_s} onChange={(v) => updateSimConfig({ phase_min_green_s: v })} min={5} max={60} />
      </FormRow>
      <FormRow label="Max Green Time (s)" help="Maximum green duration per phase. Prevents one direction monopolizing green">
        <NumberInput value={simConfig.phase_max_green_s} onChange={(v) => updateSimConfig({ phase_max_green_s: v })} min={30} max={180} />
      </FormRow>
      <FormRow label="Yellow Time (s)" help="Amber/transition time between phases. GHMC standard: 4 seconds">
        <NumberInput value={simConfig.yellow_time_s} onChange={(v) => updateSimConfig({ yellow_time_s: v })} min={2} max={8} />
      </FormRow>
      <FormRow label="All-Red Time (s)" help="Safety clearance interval (all red). GHMC standard: 2 seconds">
        <NumberInput value={simConfig.all_red_time_s} onChange={(v) => updateSimConfig({ all_red_time_s: v })} min={0} max={5} />
      </FormRow>
      <FormRow label="Cycle Length (s)" help="Total signal cycle duration. Webster optimal: 60–120s for Hyderabad volumes">
        <NumberInput value={simConfig.cycle_length_s} onChange={(v) => updateSimConfig({ cycle_length_s: v })} min={30} max={300} />
      </FormRow>
    </div>
  )
}

function SectionE({ simConfig, updateSimConfig }: { simConfig: SimConfig; updateSimConfig: (u: Partial<SimConfig>) => void }) {
  return (
    <div className="space-y-7">
      <div>
        <h5 className="text-[10.5px] font-bold text-[#8fb8ce] uppercase tracking-wider mb-4 flex items-center gap-2 font-mono">
          <span className="w-1.5 h-3 rounded-sm bg-[#8fb8ce] inline-block" />
          Network Hyperparameters
        </h5>
        <div className="grid grid-cols-2 gap-5">
          <FormRow label="RL Algorithm" help="Reinforcement learning algorithm. PPO is state-of-the-art for traffic control">
            <SelectInput value={simConfig.rl_algorithm} onChange={(v) => updateSimConfig({ rl_algorithm: v })}
              options={[
                { value: 'PPO', label: 'PPO (Recommended)' },
                { value: 'A2C', label: 'A2C' },
                { value: 'DQN', label: 'DQN (Discrete)' },
              ]} />
          </FormRow>
          <FormRow label="Total Timesteps" help="Training steps. 500k is default — more = better but slower. Quick demo: 80k" required>
            <NumberInput value={simConfig.total_timesteps} onChange={(v) => updateSimConfig({ total_timesteps: v })} min={1000} max={5000000} step={1000} />
          </FormRow>
          <FormRow label="Learning Rate" help="Model learning rate. Default 0.0003 is well-tuned for traffic environments" required>
            <input type="number" className={inputCls} value={simConfig.learning_rate} min={0.00001} max={0.01} step={0.00001}
              onChange={(e) => updateSimConfig({ learning_rate: Number(e.target.value) })} />
          </FormRow>
          <FormRow label="Discount Factor (γ)" help="Determines horizon of future rewards (0.80–0.999)" required>
            <input type="number" className={inputCls} value={simConfig.discount_factor ?? 0.99} min={0.8} max={0.999} step={0.001}
              onChange={(e) => updateSimConfig({ discount_factor: Number(e.target.value) })} />
          </FormRow>
          <FormRow label="Hidden Layer Size" help="Neurons per hidden layer in policy MLP. Larger model fits complex dynamics but is slower">
            <SelectInput value={String(simConfig.hidden_layer_size ?? 64)} onChange={(v) => updateSimConfig({ hidden_layer_size: Number(v) })}
              options={[
                { value: '32', label: '32 neurons — Light' },
                { value: '64', label: '64 neurons — Balanced' },
                { value: '128', label: '128 neurons — Large' },
                { value: '256', label: '256 neurons — Heavy' },
              ]} />
          </FormRow>
        </div>
      </div>
      <div className="border-t border-white/[0.05] pt-6">
        <h5 className="text-[10.5px] font-bold text-[#8fb8ce] uppercase tracking-wider mb-1 flex items-center gap-2 font-mono">
          <span className="w-1.5 h-3 rounded-sm bg-[#8fb8ce] inline-block" />
          Reward Weights
        </h5>
        <p className="text-[10.5px] text-slate-500 mb-5 leading-normal">Shape the agent's optimization priorities. Higher = more influence on decisions.</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-4">
          <SliderRow label="Queue Penalty" help="How heavily the agent is penalized for accumulated queue lengths at approaches."
            value={simConfig.reward_wt_queue ?? 1.0} onChange={(v) => updateSimConfig({ reward_wt_queue: v })}
            min={0} max={5} step={0.1} display={(simConfig.reward_wt_queue ?? 1.0).toFixed(1)} />
          <SliderRow label="Wait Time Penalty" help="How heavily the agent is penalized for vehicle waiting delay."
            value={simConfig.reward_wt_wait ?? 0.5} onChange={(v) => updateSimConfig({ reward_wt_wait: v })}
            min={0} max={5} step={0.1} display={(simConfig.reward_wt_wait ?? 0.5).toFixed(1)} />
          <SliderRow label="Throughput Bonus" help="Clearance bonus paid to the agent for every vehicle successfully traversing the intersection."
            value={simConfig.reward_wt_throughput ?? 2.0} onChange={(v) => updateSimConfig({ reward_wt_throughput: v })}
            min={0} max={5} step={0.1} display={(simConfig.reward_wt_throughput ?? 2.0).toFixed(1)} />
          <SliderRow label="Collision Penalty" help="Severe penalty applied to the agent if any collisions occur due to risky phase decisions."
            value={simConfig.reward_wt_collision ?? 1.5} onChange={(v) => updateSimConfig({ reward_wt_collision: v })}
            min={0} max={5} step={0.1} display={(simConfig.reward_wt_collision ?? 1.5).toFixed(1)} />
          <SliderRow label="Phase Switch Penalty" help="Penalty for changing signal phases needlessly, forcing the agent to learn stable greens."
            value={simConfig.reward_wt_switch ?? 0.15} onChange={(v) => updateSimConfig({ reward_wt_switch: v })}
            min={0} max={1} step={0.05} display={(simConfig.reward_wt_switch ?? 0.15).toFixed(2)} />
        </div>
      </div>
    </div>
  )
}

function SectionF({ simConfig, updateSimConfig }: { simConfig: SimConfig; updateSimConfig: (u: Partial<SimConfig>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-5">
      <FormRow label="Simulation Speed (×)" help="How many sim seconds per real second. 10× is default — higher = faster training">
        <NumberInput value={simConfig.sim_speed_multiplier} onChange={(v) => updateSimConfig({ sim_speed_multiplier: v })} min={1} max={100} />
      </FormRow>
      <FormRow label="Warm-Up Period (s)" help="Time before metrics collection starts — lets traffic reach steady state">
        <NumberInput value={simConfig.warm_up_s} onChange={(v) => updateSimConfig({ warm_up_s: v })} min={0} max={600} step={30} />
      </FormRow>
    </div>
  )
}

function SectionG({ simConfig, updateSimConfig }: { simConfig: SimConfig; updateSimConfig: (u: Partial<SimConfig>) => void }) {
  return (
    <div className="space-y-6">
      <div className="text-[11.5px] rounded-xl px-4.5 py-3.5 bg-gradient-to-br from-amber-950/15 to-orange-950/5 border border-amber-500/15 space-y-1.5 leading-relaxed shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
        <p className="font-bold text-amber-400 font-mono uppercase tracking-wider text-[10px] flex items-center gap-1.5">
          <span className="text-[12px]">📐</span> Baseline Reference
        </p>
        <p className="text-slate-400">These values are the calibrated yardstick for the pre-timed Webster controller. All RL improvements are measured against these.</p>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">
        <SliderRow label="Avg Wait Delay" help="The calibrated benchmark average stopped wait time for the pre-timed baseline cycle."
          value={simConfig.baseline_wait_delay ?? 85} onChange={(v) => updateSimConfig({ baseline_wait_delay: v })}
          min={10} max={200} step={5} display={`${simConfig.baseline_wait_delay ?? 85}s`} accent="amber" />
        <SliderRow label="Flow Throughput" help="The benchmark baseline intersection vehicle throughput per hour."
          value={simConfig.baseline_throughput ?? 440} onChange={(v) => updateSimConfig({ baseline_throughput: v })}
          min={50} max={1000} step={10} display={`${simConfig.baseline_throughput ?? 440} vph`} accent="amber" />
        <SliderRow label="Green Utilisation" help="The percentage of green light duration actively discharged under fixed cycles."
          value={simConfig.baseline_green_util ?? 85} onChange={(v) => updateSimConfig({ baseline_green_util: v })}
          min={10} max={100} step={1} display={`${simConfig.baseline_green_util ?? 85}%`} accent="amber" />
        <SliderRow label="Signal Coordination" help="The synchronization efficiency rating of vehicle arrival platoons in fixed cycles."
          value={simConfig.baseline_coordination ?? 83} onChange={(v) => updateSimConfig({ baseline_coordination: v })}
          min={10} max={100} step={1} display={`${simConfig.baseline_coordination ?? 83}%`} accent="amber" />
      </div>
    </div>
  )
}

function SectionH({ simConfig, updateSimConfig }: { simConfig: SimConfig; updateSimConfig: (u: Partial<SimConfig>) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between p-4.5 bg-gradient-to-r from-white/[0.01] to-white/[0.02] border border-white/[0.05] rounded-xl hover:border-white/[0.08] transition-colors">
        <div>
          <p className="text-[12.5px] font-bold text-slate-200">Enable RTSP Camera</p>
          <p className="text-[10px] text-slate-500 mt-1 leading-normal">Use live CCTV/IP camera feed for real vehicle counts instead of synthetic demand</p>
        </div>
        <Toggle value={simConfig.enable_rtsp} onChange={(v) => updateSimConfig({ enable_rtsp: v })} />
      </div>
      {simConfig.enable_rtsp && (
        <div className="grid grid-cols-2 gap-5 animate-fadeIn">
          <FormRow label="RTSP Stream URL" help="Camera stream URL. Format: rtsp://user:pass@ip:port/stream">
            <input type="text" className={inputCls} value={simConfig.rtsp_url}
              placeholder="rtsp://192.168.1.100:554/stream"
              onChange={(e) => updateSimConfig({ rtsp_url: e.target.value })} />
          </FormRow>
          <FormRow label="YOLO Confidence" help="Detection confidence threshold (0.1–0.9). Lower = more detections, more noise">
            <NumberInput value={simConfig.yolo_confidence} onChange={(v) => updateSimConfig({ yolo_confidence: v })} min={0.1} max={0.95} step={0.05} />
          </FormRow>
        </div>
      )}
    </div>
  )
}

function SectionI({ adverseConfig, updateAdverseConfig }: { adverseConfig: AdverseConfig; updateAdverseConfig: (u: Partial<AdverseConfig>) => void }) {
  return (
    <div className="space-y-5">
      <div className="text-[11.5px] rounded-xl px-4.5 py-3.5 bg-gradient-to-br from-red-950/15 to-rose-950/5 border border-red-500/15 space-y-1.5 leading-relaxed shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
        <p className="font-bold text-red-400 font-mono uppercase tracking-wider text-[10px] flex items-center gap-1.5">
          <span className="inline-block animate-pulse text-[12px]">⚠️</span> Adverse Event Injection
        </p>
        <p className="text-slate-400 leading-relaxed">These parameters inject realistic failure scenarios. They train the RL agent to be robust against unexpected disruptions.</p>
      </div>
      <div className="grid grid-cols-2 gap-5">
        <FormRow label="Collision Probability" help="Probability of collision per step. 0.02 = realistic Hyderabad urban traffic">
          <NumberInput value={adverseConfig.collision_probability} onChange={(v) => updateAdverseConfig({ collision_probability: v })} min={0} max={0.5} step={0.01} />
        </FormRow>
        <FormRow label="Rear-End Risk Factor" help="Multiplier for rear-end collision probability in dense traffic. 0=none, 1=maximum">
          <NumberInput value={adverseConfig.rear_end_risk_factor} onChange={(v) => updateAdverseConfig({ rear_end_risk_factor: v })} min={0} max={1} step={0.05} />
        </FormRow>
        <FormRow label="Red Light Run Probability" help="Fraction of vehicles that run red lights per cycle. Hyderabad: ~5–8%">
          <NumberInput value={adverseConfig.red_light_run_prob} onChange={(v) => updateAdverseConfig({ red_light_run_prob: v })} min={0} max={0.3} step={0.01} />
        </FormRow>
        <FormRow label="Signal Failure Probability" help="Probability of a signal controller failure per timestep">
          <NumberInput value={adverseConfig.signal_failure_prob} onChange={(v) => updateAdverseConfig({ signal_failure_prob: v })} min={0} max={0.2} step={0.005} />
        </FormRow>
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-white/[0.01] to-white/[0.02] border border-white/[0.05] rounded-xl col-span-2 hover:border-white/[0.08] transition-colors">
          <div>
            <p className="text-[12.5px] font-bold text-slate-200">Waterlogging</p>
            <p className="text-[10px] text-slate-500 mt-1 leading-normal">Enable monsoon waterlogging scenario — reduces saturation flow</p>
          </div>
          <Toggle value={adverseConfig.waterlogging_enabled} onChange={(v) => updateAdverseConfig({ waterlogging_enabled: v })} />
        </div>
        {adverseConfig.waterlogging_enabled && (
          <FormRow label="Waterlogging Severity (0–1)" help="0 = light puddles, 1 = full road closure">
            <NumberInput value={adverseConfig.waterlogging_severity} onChange={(v) => updateAdverseConfig({ waterlogging_severity: v })} min={0} max={1} step={0.1} />
          </FormRow>
        )}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-white/[0.01] to-white/[0.02] border border-white/[0.05] rounded-xl col-span-2 hover:border-white/[0.08] transition-colors">
          <div>
            <p className="text-[12.5px] font-bold text-slate-200">VIP Convoy</p>
            <p className="text-[10px] text-slate-500 mt-1 leading-normal">Simulate VIP passage events that force green holds</p>
          </div>
          <Toggle value={adverseConfig.vip_convoy_enabled} onChange={(v) => updateAdverseConfig({ vip_convoy_enabled: v })} />
        </div>
      </div>
    </div>
  )
}

function SectionJ() {
  const { simConfig, adverseConfig, updateSimConfig, updateAdverseConfig } = useConfigStore()
  const [presetScale, setPresetScale] = useState<'All' | 'Very Light' | 'Light' | 'Medium' | 'Heavy' | 'Extreme' | 'Custom'>('All')
  const [activeQuickPresetId, setActiveQuickPresetId] = useState<string>('m_standard')

  // Intersection Choice logic
  const intersectionChoice = simConfig.intersection_type === 'six_arm'
    ? '5-road'
    : simConfig.intersection_type === 'custom'
    ? 'custom-json'
    : '4-road'

  const setIntersectionChoice = (choice: '4-road' | '5-road' | 'custom-json') => {
    if (choice === '5-road') {
      updateSimConfig({ intersection_type: 'six_arm', n_lanes: Math.max(3, Number(simConfig.n_lanes ?? 3)) })
    } else if (choice === '4-road') {
      updateSimConfig({ intersection_type: 'four_way' })
    } else {
      updateSimConfig({ intersection_type: 'custom' })
    }
  }

  // Traffic Volume logic
  const trafficVolume = Number(simConfig.total_vph ?? 10000)
  const setTrafficVolume = (vol: number) => {
    updateSimConfig({ total_vph: vol })
  }

  // Spawn Multipliers logic
  const spawnMultipliers: Record<'bike' | 'car' | 'auto' | 'bus' | 'truck', number> = {
    bike: Number(simConfig.spawn_mult_bike ?? 4),
    car: Number(simConfig.spawn_mult_car ?? 3),
    auto: Number(simConfig.spawn_mult_auto ?? 2),
    bus: Number(simConfig.spawn_mult_bus ?? 1.5),
    truck: Number(simConfig.spawn_mult_truck ?? 1),
  }

  const handleMultiplierChange = (key: 'bike' | 'car' | 'auto' | 'bus' | 'truck', value: number) => {
    const nextMults = {
      ...spawnMultipliers,
      [key]: value
    }
    const multiplierMap = {
      pct_two_wheeler: nextMults.bike,
      pct_car: nextMults.car,
      pct_auto_rickshaw: nextMults.auto,
      pct_tsrtc_bus: nextMults.bus,
      pct_truck: nextMults.truck,
    }
    const bases = {
      pct_two_wheeler: 40,
      pct_car: 30,
      pct_auto_rickshaw: 15,
      pct_tsrtc_bus: 10,
      pct_truck: 5,
    }
    const weighted = Object.entries(multiplierMap).map(([k, mult]) => {
      const base = bases[k as keyof typeof bases]
      return { key: k, value: Math.max(0.01, base * mult) }
    })
    const sum = weighted.reduce((acc, item) => acc + item.value, 0)
    const normalized = weighted.reduce<Record<string, number>>((acc, item) => {
      acc[item.key] = Number(((item.value / sum) * 100).toFixed(1))
      return acc
    }, {})

    updateSimConfig({
      ...normalized,
      spawn_mult_bike: nextMults.bike,
      spawn_mult_car: nextMults.car,
      spawn_mult_auto: nextMults.auto,
      spawn_mult_bus: nextMults.bus,
      spawn_mult_truck: nextMults.truck,
    })
  }

  // Duration Choice logic
  const durationSec = simConfig.simulation_duration_s ?? 3600
  const durationChoice = durationSec === 1800 ? '30' : durationSec === 3600 ? '60' : durationSec === 5400 ? '90' : 'custom'
  
  const setDurationChoice = (choice: '30' | '60' | '90' | 'custom') => {
    if (choice === '30') updateSimConfig({ simulation_duration_s: 1800 })
    else if (choice === '60') updateSimConfig({ simulation_duration_s: 3600 })
    else if (choice === '90') updateSimConfig({ simulation_duration_s: 5400 })
  }

  const customDurationMin = Math.round(durationSec / 60)
  const setCustomDurationMin = (min: number) => {
    updateSimConfig({ simulation_duration_s: Math.max(5, min) * 60 })
  }

  // Driving Behavior logic
  const drivingBehavior = simConfig.driver_behavior ?? 'medium'
  const setDrivingBehavior = (behavior: 'safe' | 'medium' | 'aggressive' | 'very_aggressive') => {
    updateSimConfig({ driver_behavior: behavior })
    updateAdverseConfig({
      rear_end_risk_factor:
        behavior === 'safe' ? 0.05 :
        behavior === 'medium' ? 0.1 :
        behavior === 'aggressive' ? 0.2 : 0.3,
    })
  }

  // Canvas Size logic
  const canvasSize = simConfig.canvas_size ?? 'large'
  const setCanvasSize = (size: 'regular' | 'large') => {
    updateSimConfig({
      canvas_size: size,
      canvas_width: size === 'large' ? 1600 : 1110,
      canvas_height: size === 'large' ? 1000 : 800,
    })
  }

  // Custom JSON override
  const [customJsonText, setCustomJsonText] = useState('{}')
  const handleJsonChange = (text: string) => {
    setCustomJsonText(text)
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object') {
        updateSimConfig(parsed)
      }
    } catch {
      // Keep silent
    }
  }

  // Quick Preset application
  const applyQuickPreset = (presetId: string) => {
    const preset = QUICK_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    setActiveQuickPresetId(presetId)
    
    updateSimConfig({
      total_vph: preset.vehicles,
      simulation_duration_s: preset.durationMin * 60,
      canvas_size: preset.canvas,
      canvas_width: preset.canvas === 'large' ? 1600 : 1110,
      canvas_height: preset.canvas === 'large' ? 1000 : 800,
      traffic_pattern: preset.pattern as SimConfig['traffic_pattern'],
    })
  }

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
  const visibleQuickPresets = QUICK_PRESETS.filter((p) => presetScale === 'All' ? true : p.scale === presetScale)

  return (
    <div className="space-y-5 pb-4">
      {/* Presets card grid */}
      <div className="bg-[#11131a] border border-white/[0.06] rounded-xl p-4.5">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Presets</h4>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-1 mb-3.5">
          {(['All', 'Very Light', 'Light', 'Medium', 'Heavy', 'Extreme', 'Custom'] as const).map((scale) => {
            const isActive = presetScale === scale
            const col = scaleColor(scale)
            return (
              <button
                key={scale}
                type="button"
                onClick={() => setPresetScale(scale)}
                className={`px-2.5 py-1 rounded-lg text-[9.5px] font-mono font-semibold uppercase tracking-wider transition-all border ${
                  isActive
                    ? 'border-white/[0.14] bg-white/[0.06] text-slate-200'
                    : 'border-white/[0.04] text-slate-500 hover:text-slate-300 hover:border-white/[0.08]'
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

        {/* Cards */}
        <div className="grid grid-cols-2 gap-2">
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
                    : 'border-white/[0.05] bg-[#0c0e14] hover:border-white/[0.10] hover:bg-white/[0.035]'
                }`}
              >
                <div
                  className="absolute top-0 left-0 w-0.5 h-full rounded-full"
                  style={{ backgroundColor: isActive ? col : 'transparent' }}
                />
                <div className="pl-1.5">
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
                  <div className="text-[9px] text-slate-500 font-mono mt-1 tabular-nums">
                    {preset.vehicles.toLocaleString()} veh &middot; {preset.durationMin}min &middot; {preset.canvas}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Intersection Type */}
      <div className="bg-[#11131a] border border-white/[0.06] rounded-xl p-4.5">
        <div className="flex items-center gap-2 mb-3.5">
          <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Intersection Type</h4>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: '4-road', title: '4-Road', sub: 'Standard cross' },
            { id: '5-road', title: '5-Road', sub: 'Complex arm' },
            { id: 'custom-json', title: 'Custom', sub: 'JSON config' },
          ].map((opt) => {
            const isActive = intersectionChoice === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setIntersectionChoice(opt.id as any)}
                className={`rounded-xl border p-3 text-left transition-all duration-200 ${
                  isActive
                    ? 'border-white/20 bg-white/[0.06]'
                    : 'border-white/[0.05] bg-[#0c0e14] hover:border-white/[0.12]'
                }`}
              >
                <div className={`text-[11.5px] font-semibold ${isActive ? 'text-slate-100' : 'text-slate-400'}`}>{opt.title}</div>
                <div className="text-[9px] text-slate-500 font-mono mt-0.5">{opt.sub}</div>
              </button>
            )
          })}
        </div>
        {intersectionChoice === 'custom-json' && (
          <textarea
            className="w-full mt-2.5 bg-black/35 border border-white/[0.08] rounded-xl p-3 text-[11px] text-slate-300 focus:outline-none focus:border-[#8fb8ce]/50 font-mono"
            rows={3}
            value={customJsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
          />
        )}
      </div>

      {/* Traffic Volume */}
      <div className="bg-[#11131a] border border-white/[0.06] rounded-xl p-4.5">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Traffic Volume</h4>
          </div>
          <span className="text-sm font-bold font-mono text-slate-200 tabular-nums">
            {Math.round(trafficVolume).toLocaleString()} <span className="text-[9.5px] text-slate-500">veh/hr</span>
          </span>
        </div>
        <div className="relative h-2 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.03]">
          <div className="absolute inset-y-0 left-0 bg-[#8fb8ce] rounded-full"
            style={{ width: `${((trafficVolume - 100) / 49900) * 100}%` }} />
          <input
            type="range"
            min={100}
            max={50000}
            step={100}
            value={trafficVolume}
            onChange={(e) => setTrafficVolume(Number(e.target.value))}
            className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
          />
        </div>
        <div className="flex justify-between text-[9px] text-slate-600 font-mono mt-1.5 select-none">
          <span>100</span>
          <span>50,000</span>
        </div>
      </div>

      {/* Vehicle Spawn Rate Multipliers */}
      <div className="bg-[#11131a] border border-white/[0.06] rounded-xl p-4.5">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Vehicle Spawn Rate Multipliers</h4>
          </div>
          <button
            type="button"
            onClick={() => {
              updateSimConfig({
                spawn_mult_bike: 4,
                spawn_mult_car: 3,
                spawn_mult_auto: 2,
                spawn_mult_bus: 1.5,
                spawn_mult_truck: 1,
              })
            }}
            className="text-[9px] font-mono text-slate-600 hover:text-slate-400 border border-white/[0.06] rounded-md px-2 py-0.5 transition-colors"
          >
            Reset
          </button>
        </div>
        <div className="space-y-2.5">
          {([
            { key: 'bike', label: 'Bike' },
            { key: 'car', label: 'Car' },
            { key: 'auto', label: 'Auto' },
            { key: 'bus', label: 'Bus' },
            { key: 'truck', label: 'Truck' },
          ] as const).map((row) => (
            <div key={row.key} className="grid grid-cols-[60px_1fr_40px] items-center gap-3">
              <span className="text-[10.5px] text-slate-500 font-mono">{row.label}</span>
              <div className="relative h-1.5 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.03]">
                <div className="absolute inset-y-0 left-0 bg-[#8fb8ce] rounded-full"
                  style={{ width: `${(spawnMultipliers[row.key] / 10) * 100}%` }} />
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={spawnMultipliers[row.key]}
                  onChange={(e) => handleMultiplierChange(row.key, Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                />
              </div>
              <span className="text-[10px] text-slate-300 text-right font-mono font-bold tabular-nums">
                {spawnMultipliers[row.key]}&times;
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Simulation Duration */}
      <div className="bg-[#11131a] border border-white/[0.06] rounded-xl p-4.5">
        <div className="flex items-center gap-2 mb-3.5">
          <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Simulation Duration</h4>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { id: '30', label: '30 min' },
            { id: '60', label: '60 min' },
            { id: '90', label: '90 min' },
            { id: 'custom', label: 'Custom' },
          ].map((opt) => {
            const isActive = durationChoice === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDurationChoice(opt.id as any)}
                className={`rounded-xl border py-2 text-center text-[10.5px] font-mono font-semibold transition-all ${
                  isActive
                    ? 'border-white/20 bg-white/[0.06] text-slate-200'
                    : 'border-white/[0.05] bg-[#0c0e14] text-slate-500 hover:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        {durationChoice === 'custom' && (
          <div className="mt-2.5">
            <NumberInput
              value={customDurationMin}
              onChange={setCustomDurationMin}
              min={5}
              max={1440}
            />
          </div>
        )}
      </div>

      {/* Driving Behavior */}
      <div className="bg-[#11131a] border border-white/[0.06] rounded-xl p-4.5">
        <div className="flex items-center gap-2 mb-3.5">
          <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Driving Behavior</h4>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { id: 'safe', label: 'Safe' },
            { id: 'medium', label: 'Medium' },
            { id: 'aggressive', label: 'Aggressive' },
            { id: 'very_aggressive', label: 'V. Aggressive' },
          ].map((opt) => {
            const isActive = drivingBehavior === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDrivingBehavior(opt.id as any)}
                className={`rounded-xl border py-2 text-[9.5px] font-mono font-semibold transition-all leading-tight ${
                  isActive
                    ? 'border-white/20 bg-white/[0.06] text-slate-200'
                    : 'border-white/[0.05] bg-[#0c0e14] text-slate-500 hover:text-slate-300'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Canvas Size */}
      <div className="bg-[#11131a] border border-white/[0.06] rounded-xl p-4.5">
        <div className="flex items-center gap-2 mb-3.5">
          <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Canvas Size</h4>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'regular', label: '1110 × 800', sub: 'Regular' },
            { id: 'large', label: '1600 × 1000', sub: 'Large' },
          ].map((opt) => {
            const isActive = canvasSize === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCanvasSize(opt.id as any)}
                className={`w-full rounded-xl border p-3.5 text-left transition-all ${
                  isActive
                    ? 'border-white/20 bg-white/[0.06]'
                    : 'border-white/[0.05] bg-[#0c0e14] hover:border-white/[0.10]'
                }`}
              >
                <div className={`text-[10px] font-mono font-semibold ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>{opt.label}</div>
                <div className="text-[8.5px] text-slate-700 font-mono mt-0.5">{opt.sub}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main ConfigModal ─────────────────────────────────────────────────────────
interface ConfigModalProps {
  open: boolean
  onClose: () => void
  onApply?: () => void
}

export default function ConfigModal({ open, onClose, onApply }: ConfigModalProps) {
  const { simConfig, adverseConfig, updateSimConfig, updateAdverseConfig, isDirty } = useConfigStore()
  const isRunning = useSimulationStore((s) => s.isRunning)

  const [activeSection, setActiveSection] = useState('J')

  // Snapshot taken when modal opens — used for revert
  const snapshot = useRef<{ simConfig: SimConfig; adverseConfig: AdverseConfig } | null>(null)
  const [changesCount, setChangesCount] = useState(0)

  // Take snapshot when modal opens
  useEffect(() => {
    if (open) {
      snapshot.current = {
        simConfig: { ...simConfig },
        adverseConfig: { ...adverseConfig },
      }
      setChangesCount(0)
    }
  }, [open])

  // Count changed fields vs snapshot
  useEffect(() => {
    if (!snapshot.current || !open) return
    const snap = snapshot.current
    let count = 0
    for (const k of Object.keys(snap.simConfig) as (keyof SimConfig)[]) {
      if (simConfig[k] !== snap.simConfig[k]) count++
    }
    for (const k of Object.keys(snap.adverseConfig) as (keyof AdverseConfig)[]) {
      if (adverseConfig[k] !== snap.adverseConfig[k]) count++
    }
    setChangesCount(count)
  }, [simConfig, adverseConfig, open])

  const handleRevert = useCallback(() => {
    if (!snapshot.current) return
    useConfigStore.setState({
      simConfig: { ...snapshot.current.simConfig },
      adverseConfig: { ...snapshot.current.adverseConfig },
      isDirty: false,
    })
    setChangesCount(0)
  }, [])

  const handleApply = () => {
    onApply?.()
    snapshot.current = { simConfig: { ...simConfig }, adverseConfig: { ...adverseConfig } }
    setChangesCount(0)
    onClose()
  }

  // Keyboard dismiss
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const activeMeta = ALL_SECTIONS.find((s) => s.id === activeSection)

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(16px)' }}
      onClick={onClose}
    >
      <div
        className="relative flex w-full rounded-2xl overflow-hidden animate-fadeIn"
        style={{
          maxWidth: 960,
          height: '88vh',
          background: '#000000',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.02)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow accent top (unified white-blue) */}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, rgba(143, 184, 206, 0.4), transparent)`,
            boxShadow: `0 0 10px rgba(143, 184, 206, 0.15)`
          }} />

        {/* ── LEFT NAV SIDEBAR ───────────────────────────────── */}
        <div className="w-56 flex-shrink-0 flex flex-col border-r border-white/[0.05] bg-[#050508]">
          {/* Sidebar header - aligned to h-[72px] */}
          <div className="px-5 border-b border-white/[0.05] flex items-center h-[72px] flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8.5 h-8.5 rounded-xl flex items-center justify-center text-base border border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                ⚙️
              </div>
              <div>
                <p className="text-[12px] font-bold text-slate-200 leading-none tracking-wide">Configuration</p>
                <p className="text-[8.5px] text-slate-500 mt-1 font-mono uppercase tracking-widest">SIMULATION SETTINGS</p>
              </div>
            </div>
          </div>

          {/* Nav items */}
          <div className="flex-1 overflow-y-auto custom-scrollbar py-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.id} className="mb-3">
                <p className="text-[8.5px] font-bold uppercase tracking-[0.2em] px-5 py-1.5 font-mono text-slate-500">
                  {group.label}
                </p>
                {group.sections.map((section) => {
                  const isActive = activeSection === section.id
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full text-left flex items-center gap-3 px-5 py-2 transition-all duration-200 relative ${
                        isActive
                          ? 'text-slate-100 font-bold bg-[#8fb8ce]/[0.08]'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.015]'
                      }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1 bottom-1 w-0.75 bg-[#8fb8ce] rounded-r"
                          style={{ boxShadow: '0 0 8px rgba(143,184,206,0.6)' }} />
                      )}
                      <span className={`text-base leading-none transition-all duration-200 ${isActive ? 'scale-110' : 'opacity-50'}`}>
                        {section.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[11.5px] font-semibold leading-none truncate">
                          {section.label}
                        </p>
                        <p className={`text-[9px] mt-1 truncate ${isActive ? 'text-[#8fb8ce]' : 'text-slate-500'}`}>
                          {section.hint}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Sidebar footer: revert */}
          <div className="p-4 border-t border-white/[0.05] bg-black/10">
            <button
              onClick={handleRevert}
              disabled={changesCount === 0}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11.5px] font-bold transition-all duration-300 border ${
                changesCount > 0
                  ? 'border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-orange-500/5 text-amber-400 hover:from-amber-500/20 hover:to-orange-500/10 hover:border-amber-500/45 hover:shadow-[0_0_12px_rgba(245,158,11,0.15)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]'
                  : 'border-white/[0.04] bg-transparent text-slate-600 cursor-not-allowed'
              }`}
            >
              <span>↩</span>
              <span>
                {changesCount > 0
                  ? `Revert ${changesCount} Change${changesCount !== 1 ? 's' : ''}`
                  : 'No Pending Changes'
                }
              </span>
            </button>
          </div>
        </div>

        {/* ── RIGHT CONTENT AREA ─────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#08080b]">

          {/* Modal header - aligned to h-[72px] */}
          <div className="flex items-center justify-between px-6.5 border-b border-white/[0.05] flex-shrink-0 bg-black/5 h-[72px]">
            <div className="flex items-center gap-3.5">
              <div className="w-8.5 h-8.5 rounded-xl flex items-center justify-center text-base border border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                {activeMeta?.icon}
              </div>
              <div>
                <h2 className="text-[12.5px] font-bold text-slate-100 leading-none">{activeMeta?.label}</h2>
                <p className="text-[9px] text-slate-500 mt-1 font-mono tracking-wide uppercase">{activeMeta?.hint}</p>
              </div>
              {changesCount > 0 && (
                <span className="ml-2 px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono bg-amber-500/10 border border-amber-500/20 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.1)] animate-pulse">
                  {changesCount} unsaved
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isRunning && (
                <span className="text-[9.5px] font-bold font-mono px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.1)]">
                  ⚠ Locked — Sim Running
                </span>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.05] transition-all text-xl border border-transparent hover:border-white/[0.08]"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Section content */}
          <div className={`flex-1 overflow-y-auto custom-scrollbar px-7 py-6 ${isRunning ? 'pointer-events-none opacity-40 select-none' : ''}`}>
            {activeSection === 'A' && <SectionA simConfig={simConfig} updateSimConfig={updateSimConfig} />}
            {activeSection === 'B' && <SectionB simConfig={simConfig} updateSimConfig={updateSimConfig} />}
            {activeSection === 'C' && <SectionC simConfig={simConfig} updateSimConfig={updateSimConfig} />}
            {activeSection === 'D' && <SectionD simConfig={simConfig} updateSimConfig={updateSimConfig} />}
            {activeSection === 'E' && <SectionE simConfig={simConfig} updateSimConfig={updateSimConfig} />}
            {activeSection === 'F' && <SectionF simConfig={simConfig} updateSimConfig={updateSimConfig} />}
            {activeSection === 'G' && <SectionG simConfig={simConfig} updateSimConfig={updateSimConfig} />}
            {activeSection === 'H' && <SectionH simConfig={simConfig} updateSimConfig={updateSimConfig} />}
            {activeSection === 'I' && <SectionI adverseConfig={adverseConfig} updateAdverseConfig={updateAdverseConfig} />}
            {activeSection === 'J' && <SectionJ />}
          </div>

          {/* Footer: Apply */}
          <div className="flex-shrink-0 px-7 py-4 border-t border-white/[0.05] flex items-center justify-between bg-[#050508]"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.01)' }}>
            <div className="text-[10.5px] font-mono flex items-center gap-2">
              {changesCount > 0 ? (
                <>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span className="text-amber-400 font-semibold">{changesCount} field{changesCount !== 1 ? 's' : ''} modified</span>
                  <span className="text-slate-500">— click Apply to take effect</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                  <span className="text-slate-400">All configurations are up to date</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-[11.5px] font-bold text-slate-400 hover:text-slate-100 hover:bg-white/[0.03] hover:border-white/[0.12] transition-all border border-white/[0.05]"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={isRunning}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[12px] font-bold transition-all duration-300 border shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] ${
                  isRunning
                    ? 'bg-white/[0.01] border-white/[0.03] text-slate-600 cursor-not-allowed'
                    : 'bg-[#8fb8ce]/[0.09] border-[#8fb8ce]/25 text-[#8fb8ce]/90 hover:bg-[#8fb8ce]/[0.15] hover:border-[#8fb8ce]/45 hover:text-[#8fb8ce] hover:shadow-[0_0_16px_rgba(143,184,206,0.15)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                }`}
              >
                <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="2,7 6,11 12,3" />
                </svg>
                Apply & Update Simulation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
