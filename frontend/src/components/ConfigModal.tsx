import { useState, useEffect, useRef, useCallback } from 'react'
import ReactDOM from 'react-dom'
import type { ReactNode } from 'react'
import { useConfigStore } from '../store/configStore'
import { useSimulationStore } from '../store/simulationStore'
import HelpPopover from './HelpPopover'
import type { SimConfig, AdverseConfig } from '../types'
import { TrainingModeSelector } from './TrainingModeSelector'

// ─── Nav Section Definitions ─────────────────────────────────────────────────
const ALL_NAV_GROUPS = [
  {
    id: 'start',
    label: 'Start Here',
    sections: [
      { id: 'J', label: 'Scenario Packs', hint: 'City presets & custom builder', icon: '🗺️' },
      { id: 'L', label: 'Road Layout', hint: 'Configure intersection geometry', icon: '🛣️' },
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
    id: 'risk',
    label: 'Data & Risk',
    sections: [
      { id: 'H', label: 'Camera Input', hint: 'RTSP & detection confidence', icon: '📹' },
      { id: 'I', label: 'Incident & Risk', hint: 'Failure & adverse settings', icon: '⚠️' },
    ],
  },
]

const ALL_SECTIONS = ALL_NAV_GROUPS.flatMap((g) => g.sections)

const QUICK_PRESETS = [
  { id: 'vp_offpeak', scale: 'Very Light', name: 'Very Light - Off Peak', vehicles: 2000, durationMin: 60, pattern: 'uniform', canvas: 'regular', multipliers: { bike: 4.0, car: 3.0, auto: 2.0, bus: 1.5, truck: 1.0 } },
  { id: 'l_bike', scale: 'Light', name: 'Light - Bike City', vehicles: 5000, durationMin: 60, pattern: 'uniform', canvas: 'regular', multipliers: { bike: 8.0, car: 2.0, auto: 2.0, bus: 1.0, truck: 0.5 } },
  { id: 'l_mixed', scale: 'Light', name: 'Light - Mixed', vehicles: 5000, durationMin: 60, pattern: 'uniform', canvas: 'regular', multipliers: { bike: 4.0, car: 3.0, auto: 2.0, bus: 1.5, truck: 1.0 } },
  { id: 'm_standard', scale: 'Medium', name: 'Medium - Standard', vehicles: 10000, durationMin: 60, pattern: 'uniform', canvas: 'regular', multipliers: { bike: 4.0, car: 3.0, auto: 2.0, bus: 1.5, truck: 1.0 } },
  { id: 'm_car', scale: 'Medium', name: 'Medium - Car Heavy', vehicles: 10000, durationMin: 60, pattern: 'uniform', canvas: 'regular', multipliers: { bike: 2.0, car: 7.0, auto: 1.5, bus: 1.0, truck: 0.5 } },
  { id: 'm_commercial', scale: 'Medium', name: 'Medium - Commercial', vehicles: 8000, durationMin: 60, pattern: 'bidirectional', canvas: 'regular', multipliers: { bike: 1.5, car: 2.0, auto: 1.0, bus: 4.0, truck: 5.0 } },
  { id: 'h_peak', scale: 'Heavy', name: 'Heavy - Peak Hour', vehicles: 15000, durationMin: 60, pattern: 'morning_peak', canvas: 'large', multipliers: { bike: 5.0, car: 6.0, auto: 3.0, bus: 2.0, truck: 1.0 } },
  { id: 'h_tw', scale: 'Heavy', name: 'Heavy - Two-Wheeler Surge', vehicles: 15000, durationMin: 60, pattern: 'evening_peak', canvas: 'large', multipliers: { bike: 9.0, car: 3.0, auto: 2.0, bus: 1.0, truck: 0.5 } },
  { id: 'h_commercial', scale: 'Heavy', name: 'Heavy - Commercial Rush', vehicles: 15000, durationMin: 60, pattern: 'bidirectional', canvas: 'large', multipliers: { bike: 2.0, car: 2.0, auto: 1.0, bus: 5.0, truck: 7.0 } },
  { id: 'x_max', scale: 'Extreme', name: 'Extreme - Max Load', vehicles: 15000, durationMin: 60, pattern: 'random', canvas: 'large', multipliers: { bike: 4.0, car: 3.0, auto: 2.0, bus: 1.5, truck: 1.0 } },
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

function SelectInput({ value, onChange, options, disabled }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean
}) {
  return (
    <select
      className={`${selectCls} ${disabled ? 'opacity-50 cursor-not-allowed select-none bg-slate-900/40 text-slate-500 border-white/[0.04]' : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      {options.map((o) => <option key={o.value} value={o.value} className="bg-[#0c0c0e] text-slate-200">{o.label}</option>)}
    </select>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className="relative rounded-full transition-all duration-300 border focus:outline-none flex-shrink-0 cursor-pointer"
      style={{
        width: '42px',
        height: '24px',
        padding: '2px',
        backgroundColor: value ? 'rgba(143, 184, 206, 0.95)' : 'rgba(15, 23, 42, 0.6)',
        borderColor: value ? 'rgba(143, 184, 206, 0.4)' : 'rgba(255, 255, 255, 0.08)',
        boxShadow: value ? '0 0 10px rgba(143, 184, 206, 0.25)' : 'none',
      }}
      onClick={() => onChange(!value)}
    >
      <span
        className="block rounded-full bg-white shadow transition-transform duration-300 ease-out"
        style={{
          width: '18px',
          height: '18px',
          transform: value ? 'translateX(18px)' : 'translateX(0px)',
        }}
      />
    </button>
  )
}

const ToggleInput = Toggle


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

function SectionE({ simConfig, updateSimConfig, activeModelKey }: {
  simConfig: SimConfig; updateSimConfig: (u: Partial<SimConfig>) => void; activeModelKey: string
}) {
  const isPredefinedRl = ['rl1', 'rl2', 'rl3', 'rl4'].includes(activeModelKey)

  const totalSteps = Number(simConfig.total_timesteps ?? 20000)
  const resolvedTrainingMode = simConfig.training_mode ?? 'stage1'

  let stepsPerEp = 40;
  if (resolvedTrainingMode === 'stage3') {
    stepsPerEp = 360;
  } else if (resolvedTrainingMode === 'stage4') {
    stepsPerEp = Math.round(0.6 * 40 + 0.4 * 360);
  }
  const totalEpisodes = Math.round(totalSteps / stepsPerEp)

  return (
    <div className="space-y-7">
      <div>
        <h5 className="text-[10.5px] font-bold text-[#8fb8ce] uppercase tracking-wider mb-4 flex items-center gap-2 font-mono">
          <span className="w-1.5 h-3 rounded-sm bg-[#8fb8ce] inline-block" />
          Training Mode Setup
        </h5>
        <div className="mb-6 bg-black/20 p-4 border border-white/[0.04] rounded-xl">
          <TrainingModeSelector
            selected={(simConfig.training_mode as any) ?? 'stage1'}
            onChange={(m) => updateSimConfig({ training_mode: m })}
          />
        </div>
      </div>

      <div>
        <h5 className="text-[10.5px] font-bold text-[#8fb8ce] uppercase tracking-wider mb-4 flex items-center gap-2 font-mono">
          <span className="w-1.5 h-3 rounded-sm bg-[#8fb8ce] inline-block" />
          Network Hyperparameters
        </h5>
        <div className="grid grid-cols-2 gap-5">
          <FormRow label="RL Algorithm" help="Reinforcement learning algorithm. PPO is state-of-the-art for traffic control">
            <SelectInput
              value={simConfig.rl_algorithm}
              onChange={(v) => updateSimConfig({ rl_algorithm: v })}
              disabled={isPredefinedRl}
              options={[
                { value: 'PPO', label: 'PPO (Recommended)' },
                { value: 'A2C', label: 'A2C' },
                { value: 'DQN', label: 'DQN (Discrete)' },
                { value: 'SAC', label: 'SAC (Continuous)' },
              ]}
            />
          </FormRow>
          <FormRow label="Total Episodes" help="The total number of episodes to train. Default is 500 episodes (20k steps). For better convergence: 2,000 episodes (80k steps)." required>
            <NumberInput
              value={totalEpisodes}
              onChange={(v) => updateSimConfig({ total_timesteps: v * stepsPerEp })}
              min={10}
              max={125000}
              step={10}
            />
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
          <FormRow label="PPO Epochs" help="Number of optimization epochs per gradient update step. Default is 500" required>
            <NumberInput value={simConfig.ppo_epochs ?? 500} onChange={(v) => updateSimConfig({ ppo_epochs: v })} min={1} max={2000} />
          </FormRow>
          <FormRow label="Early Stopping" help="Declare convergence and stop training early when reward gains level off. Turn off to run full timesteps.">
            <ToggleInput value={simConfig.early_stopping ?? false} onChange={(v) => updateSimConfig({ early_stopping: v })} />
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



function SectionH({ simConfig, updateSimConfig }: { simConfig: SimConfig; updateSimConfig: (u: Partial<SimConfig>) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-white/[0.01] to-white/[0.02] border border-white/[0.05] rounded-xl hover:border-white/[0.08] transition-colors">
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
      <div className="text-[11.5px] rounded-xl p-4 bg-gradient-to-br from-red-950/15 to-rose-950/5 border border-red-500/15 space-y-1.5 leading-relaxed shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]">
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

const PRESET_METADATA: Record<string, { icon: string; tagline: string }> = {
  vp_offpeak: { icon: '🌙', tagline: 'Minimal traffic density, ideal for baseline calibration.' },
  l_bike: { icon: '🚲', tagline: 'High two-wheeler share, tests lane filtering dynamics.' },
  l_mixed: { icon: '🚗', tagline: 'Standard light flow with balanced fleet distribution.' },
  m_standard: { icon: '🏢', tagline: 'Balanced commuter load, typical urban baseline workload.' },
  m_car: { icon: '🏎️', tagline: 'High private vehicle density, tests queue accumulation.' },
  m_commercial: { icon: '🚛', tagline: 'Heavy delivery truck flows, checks bidirectional bottlenecks.' },
  h_peak: { icon: '🚨', tagline: 'Severe commuter rush, tests green duration limit boundaries.' },
  h_tw: { icon: '🛵', tagline: 'Massive motorcycle rush-hour surge, dense lane splitting.' },
  h_commercial: { icon: '🚚', tagline: 'Heavy transport logistics flow, tests truck priority lanes.' },
  x_max: { icon: '🌋', tagline: 'Unregulated peak overload, validates failure resistance.' },
}

function SectionJ({ isBaseline }: { isBaseline: boolean }) {
  const { simConfig, adverseConfig, updateSimConfig, updateAdverseConfig, tabConfigs } = useConfigStore()
  const [presetScale, setPresetScale] = useState<'All' | 'Very Light' | 'Light' | 'Medium' | 'Heavy' | 'Extreme' | 'Custom'>('All')
  const [activeQuickPresetId, setActiveQuickPresetId] = useState<string>('m_standard')

  // When Same as Baseline is active on RL, read values from baselineConfig
  const baselineConfig = tabConfigs.baseline || simConfig
  const isSyncActive = !isBaseline && !!simConfig.same_as_baseline
  const activeConfig = isSyncActive ? baselineConfig : simConfig

  // Duration Choice logic
  const durationSec = activeConfig.simulation_duration_s ?? 3600
  const computedChoice = durationSec === 1800 ? '30' : durationSec === 3600 ? '60' : durationSec === 5400 ? '90' : 'custom'

  const [durationChoice, setDurationChoiceState] = useState<'30' | '60' | '90' | 'custom'>(computedChoice)
  const [customDurationMin, setCustomDurationMinState] = useState<number>(() => Math.round(durationSec / 60))

  useEffect(() => {
    if (durationChoice === 'custom') {
      if (durationSec !== customDurationMin * 60) {
        const computed = durationSec === 1800 ? '30' : durationSec === 3600 ? '60' : durationSec === 5400 ? '90' : 'custom'
        setDurationChoiceState(computed)
        setCustomDurationMinState(Math.round(durationSec / 60))
      }
    } else {
      setDurationChoiceState(computedChoice)
      setCustomDurationMinState(Math.round(durationSec / 60))
    }
  }, [durationSec])

  const setDurationChoice = (choice: '30' | '60' | '90' | 'custom') => {
    if (isSyncActive) return
    setDurationChoiceState(choice)
    if (choice === '30') updateSimConfig({ simulation_duration_s: 1800 })
    else if (choice === '60') updateSimConfig({ simulation_duration_s: 3600 })
    else if (choice === '90') updateSimConfig({ simulation_duration_s: 5400 })
    else if (choice === 'custom') {
      updateSimConfig({ simulation_duration_s: customDurationMin * 60 })
    }
  }

  const setCustomDurationMin = (min: number) => {
    if (isSyncActive) return
    const val = Math.max(5, min)
    setCustomDurationMinState(val)
    updateSimConfig({ simulation_duration_s: val * 60 })
  }

  // Driving Behavior logic
  const drivingBehavior = activeConfig.driver_behavior ?? 'medium'
  const setDrivingBehavior = (behavior: 'safe' | 'medium' | 'aggressive' | 'very_aggressive') => {
    if (isSyncActive) return
    updateSimConfig({ driver_behavior: behavior })
    updateAdverseConfig({
      rear_end_risk_factor:
        behavior === 'safe' ? 0.05 :
          behavior === 'medium' ? 0.1 :
            behavior === 'aggressive' ? 0.2 : 0.3,
    })
  }

  // Canvas Size logic
  const canvasSize = activeConfig.canvas_size ?? 'large'
  const setCanvasSize = (size: 'regular' | 'large') => {
    if (isSyncActive) return
    updateSimConfig({
      canvas_size: size,
      canvas_width: size === 'large' ? 1600 : 1110,
      canvas_height: size === 'large' ? 1000 : 800,
    })
  }

  // Removed old custom JSON state (moved to SectionL)

  const getNormalizedMix = (mults: { bike: number; car: number; auto: number; bus: number; truck: number }) => {
    const bases = {
      pct_two_wheeler: 40,
      pct_car: 30,
      pct_auto_rickshaw: 15,
      pct_tsrtc_bus: 10,
      pct_truck: 5,
    }
    const weighted = [
      { key: 'pct_two_wheeler', value: Math.max(0.01, bases.pct_two_wheeler * mults.bike) },
      { key: 'pct_car', value: Math.max(0.01, bases.pct_car * mults.car) },
      { key: 'pct_auto_rickshaw', value: Math.max(0.01, bases.pct_auto_rickshaw * mults.auto) },
      { key: 'pct_tsrtc_bus', value: Math.max(0.01, bases.pct_tsrtc_bus * mults.bus) },
      { key: 'pct_truck', value: Math.max(0.01, bases.pct_truck * mults.truck) },
    ]
    const sum = weighted.reduce((acc, item) => acc + item.value, 0)
    const result: Record<string, number> = {
      pct_car: 0,
      pct_two_wheeler: 0,
      pct_ev_scooter: 0,
      pct_auto_rickshaw: 0,
      pct_e_rickshaw: 0,
      pct_cab: 0,
      pct_delivery_bike: 0,
      pct_tsrtc_bus: 0,
      pct_school_bus: 0,
      pct_truck: 0,
    }
    weighted.forEach((item) => {
      result[item.key] = Number(((item.value / sum) * 100).toFixed(1))
    })
    const currentSum = Object.values(result).reduce((a, b) => a + b, 0)
    if (currentSum !== 100) {
      result['pct_two_wheeler'] = Number((result['pct_two_wheeler'] + (100 - currentSum)).toFixed(1))
    }
    return result
  }

  // Quick Preset application
  const applyQuickPreset = (presetId: string) => {
    if (isSyncActive) return
    const preset = QUICK_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    setActiveQuickPresetId(presetId)

    const mix = getNormalizedMix(preset.multipliers)
    updateSimConfig({
      ...mix,
      total_vph: preset.vehicles,
      simulation_duration_s: preset.durationMin * 60,
      canvas_size: preset.canvas,
      canvas_width: preset.canvas === 'large' ? 1600 : 1110,
      canvas_height: preset.canvas === 'large' ? 1000 : 800,
      traffic_pattern: preset.pattern as SimConfig['traffic_pattern'],
      spawn_mult_bike: preset.multipliers.bike,
      spawn_mult_car: preset.multipliers.car,
      spawn_mult_auto: preset.multipliers.auto,
      spawn_mult_bus: preset.multipliers.bus,
      spawn_mult_truck: preset.multipliers.truck,
    })
  }

  const vehicleMixTotal = VEHICLE_MIX_FIELDS.reduce((s, [k]) => s + ((activeConfig[k] as number) ?? 0), 0)
  const isMixOver = vehicleMixTotal > 100
  const isMixUnder = vehicleMixTotal < 100

  const handleMixChange = (key: keyof SimConfig, val: number) => {
    if (isSyncActive) return
    updateSimConfig({ [key]: val } as Partial<SimConfig>)
  }

  const SCALE_COLORS: Record<string, string> = {
    'All': '#64748b',
    'Very Light': '#10b981',
    'Light': '#34d399',
    'Medium': '#fbbf24',
    'Heavy': '#f97316',
    'Extreme': '#ef4444',
    'Custom': '#8fb8ce',
  }
  const scaleColor = (scale: string) => SCALE_COLORS[scale] ?? '#64748b'
  const visibleQuickPresets = QUICK_PRESETS.filter((p) => presetScale === 'All' ? true : p.scale === presetScale)

  return (
    <div className="space-y-6 pb-4">
      {/* Same as Baseline Toggle Box (Only for RL views) */}
      {!isBaseline && (
        <div className={`p-4 bg-gradient-to-r from-blue-950/20 to-indigo-950/10 border rounded-2xl flex items-center justify-between gap-4 transition-all duration-300 ${simConfig.same_as_baseline
          ? 'border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)] bg-blue-950/25'
          : 'border-white/[0.06] hover:border-white/[0.12]'
          }`}>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className={`text-[12px] ${simConfig.same_as_baseline ? 'text-blue-400' : 'text-slate-400'}`}>🔗</span>
              <p className="text-[12.5px] font-bold text-slate-200">Same as Baseline Setup</p>
              {simConfig.same_as_baseline && (
                <span className="text-[8.5px] font-mono font-bold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded-md">
                  Active & Locked
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 leading-normal max-w-lg">
              Locks all layout, demand volumes, durations, driving behaviors, and mix parameters to exactly mirror the Baseline tab configuration.
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateSimConfig({ same_as_baseline: !simConfig.same_as_baseline })}
            className="relative rounded-full transition-all duration-300 border focus:outline-none flex-shrink-0 cursor-pointer"
            style={{
              width: '42px',
              height: '24px',
              padding: '2px',
              backgroundColor: simConfig.same_as_baseline ? 'rgba(59, 130, 246, 0.95)' : 'rgba(15, 23, 42, 0.6)',
              borderColor: simConfig.same_as_baseline ? 'rgba(59, 130, 246, 0.4)' : 'rgba(255, 255, 255, 0.08)',
              boxShadow: simConfig.same_as_baseline ? '0 0 10px rgba(59, 130, 246, 0.25)' : 'none',
            }}
          >
            <span
              className="block rounded-full bg-white shadow transition-transform duration-300 ease-out"
              style={{
                width: '18px',
                height: '18px',
                transform: simConfig.same_as_baseline ? 'translateX(18px)' : 'translateX(0px)',
              }}
            />
          </button>
        </div>
      )}

      {/* Main configuration container */}
      <div className={`space-y-6 transition-all duration-300 ${isSyncActive ? 'opacity-40 pointer-events-none filter blur-[0.2px]' : ''}`}>

        {/* Presets card grid */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 shadow-lg shadow-black/10 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Scenario Packs</h4>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1.5 mb-4 bg-black/20 p-1 rounded-xl border border-white/[0.04]">
            {(['All', 'Very Light', 'Light', 'Medium', 'Heavy', 'Extreme', 'Custom'] as const).map((scale) => {
              const isActive = presetScale === scale
              const col = scaleColor(scale)
              return (
                <button
                  key={scale}
                  type="button"
                  onClick={() => setPresetScale(scale)}
                  className={`relative px-3 py-1.5 rounded-lg text-[9.5px] font-mono font-semibold uppercase tracking-wider transition-all ${isActive
                    ? 'text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] bg-white/[0.05]'
                    : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: col }}
                    />
                    {scale}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Cards */}
          <div className="grid grid-cols-2 gap-3">
            {visibleQuickPresets.map((preset) => {
              const isActive = activeQuickPresetId === preset.id
              const col = scaleColor(preset.scale)
              const meta = PRESET_METADATA[preset.id] || { icon: '🗺️', tagline: 'Preconfigured scenario pack.' }
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyQuickPreset(preset.id)}
                  className={`group rounded-xl border p-3.5 text-left transition-all duration-200 relative overflow-hidden bg-gradient-to-b ${isActive
                    ? 'border-white/[0.14] bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_16px_rgba(0,0,0,0.4)]'
                    : 'border-white/[0.04] bg-[#0c0e14]/50 hover:border-white/[0.10] hover:bg-[#0c0e14]/80'
                    }`}
                >
                  <div
                    className="absolute top-0 left-0 w-0.5 h-full rounded-full transition-transform duration-300"
                    style={{ backgroundColor: isActive ? col : 'transparent' }}
                  />
                  <div className="pl-1.5">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span
                        className="text-[8px] font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-md"
                        style={{
                          color: col,
                          backgroundColor: `${col}12`,
                          border: `1px solid ${col}25`,
                        }}
                      >
                        {preset.scale}
                      </span>
                    </div>
                    <div className={`text-[11.5px] font-bold leading-tight ${isActive ? 'text-slate-100' : 'text-slate-300'}`}>
                      {preset.name.split(' - ').slice(1).join(' - ') || preset.name}
                    </div>
                    <div className="text-[9.5px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {meta.tagline}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-white/[0.03] text-[9px] font-mono text-slate-500 font-medium select-none uppercase">
                      <span>Vol: {preset.vehicles.toLocaleString()}</span>
                      <span>Size: {preset.canvas}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Road Layout moved to dedicated tab */}

        {/* Traffic Demand */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 shadow-lg shadow-black/10 backdrop-blur-sm space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Traffic Demand</h4>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <SliderRow
                label="Total Volume (vph)"
                help="Total vehicles per hour entering the intersection. Hyderabad peak: 1500–2500 vph"
                value={Number(activeConfig.total_vph ?? 1000)}
                onChange={(v) => updateSimConfig({ total_vph: v })}
                min={50}
                max={5000}
                step={50}
                display={`${activeConfig.total_vph ?? 1000} vph`}
              />
            </div>
            <FormRow label="Traffic Pattern" help="How demand is distributed over the simulation period. Morning/evening peaks reflect Hyderabad commute patterns">
              <SelectInput value={activeConfig.traffic_pattern} onChange={(v) => updateSimConfig({ traffic_pattern: v as SimConfig['traffic_pattern'] })}
                options={[
                  { value: 'uniform', label: 'Uniform' },
                  { value: 'morning_peak', label: 'Morning Peak (8–10 AM)' },
                  { value: 'evening_peak', label: 'Evening Peak (6–9 PM)' },
                  { value: 'bidirectional', label: 'Bidirectional' },
                  { value: 'random', label: 'Random' },
                ]} />
            </FormRow>
            <FormRow label="Arrival Distribution" help="Statistical model for vehicle arrival times. Poisson is most realistic for urban traffic">
              <SelectInput value={activeConfig.arrival_distribution} onChange={(v) => updateSimConfig({ arrival_distribution: v as SimConfig['arrival_distribution'] })}
                options={[
                  { value: 'poisson', label: 'Poisson (Recommended)' },
                  { value: 'weibull', label: 'Weibull' },
                  { value: 'uniform', label: 'Uniform' },
                ]} />
            </FormRow>
          </div>
        </div>

        {/* Vehicle Mix */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 shadow-lg shadow-black/10 backdrop-blur-sm space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Vehicle Mix</h4>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isSyncActive) return
                updateSimConfig({
                  pct_car: 30,
                  pct_two_wheeler: 40,
                  pct_ev_scooter: 0,
                  pct_auto_rickshaw: 15,
                  pct_e_rickshaw: 0,
                  pct_cab: 0,
                  pct_delivery_bike: 0,
                  pct_tsrtc_bus: 10,
                  pct_school_bus: 0,
                  pct_truck: 5,
                })
              }}
              className="text-[9.5px] font-mono font-semibold text-slate-500 hover:text-slate-300 border border-white/[0.06] bg-white/[0.01] rounded-lg px-2.5 py-1 transition-colors"
            >
              Reset
            </button>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className={`flex items-center justify-between text-xs rounded-xl px-4 py-2.5 border transition-all duration-300 col-span-2 ${vehicleMixTotal === 100
              ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400'
              : 'bg-amber-500/5 border-amber-500/20 text-amber-400'
              }`}>
              <span className="font-mono font-bold tracking-wide flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${vehicleMixTotal === 100 ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                {isMixOver ? `Over by ${vehicleMixTotal - 100}%` : isMixUnder ? `Under by ${100 - vehicleMixTotal}% remaining` : '✓ Total allocation is perfect'}
              </span>
              <span className="font-mono font-black tabular-nums text-xl">{vehicleMixTotal}%</span>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-4 col-span-2">
              {VEHICLE_MIX_FIELDS.map(([key, label, help]) => (
                <div key={key as string} className="space-y-2 group">
                  <div className="flex justify-between items-center">
                    <span className="text-[11.5px] text-slate-400 font-semibold flex items-center gap-1 group-hover:text-slate-300 transition-colors">
                      {label}<HelpPopover text={help} />
                    </span>
                    <span className="font-mono font-bold text-[#8fb8ce] text-[12.5px]">{activeConfig[key] as number}%</span>
                  </div>
                  <div className="relative h-2 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.03]">
                    <div className="absolute inset-y-0 left-0 rounded-full transition-all bg-[#8fb8ce]"
                      style={{ width: `${Math.min(100, (activeConfig[key] as number) ?? 0)}%` }} />
                    <input type="range" className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                      min={0} max={100} step={1} value={(activeConfig[key] as number) ?? 0}
                      onChange={(e) => handleMixChange(key, Number(e.target.value))} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Simulation Duration */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 shadow-lg shadow-black/10 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Simulation Duration</h4>
          </div>
          <div className="flex bg-black/35 rounded-xl p-1 border border-white/[0.06] gap-1.5">
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
                  className={`flex-1 py-2 rounded-lg text-center text-[10px] font-mono font-semibold transition-all border ${isActive
                    ? 'bg-white/[0.06] border-white/[0.08] text-slate-100 shadow'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          {durationChoice === 'custom' && (
            <div className="mt-4 animate-fadeIn space-y-2">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-slate-500">Custom Duration</span>
                <span className="text-[#8fb8ce] font-bold">{customDurationMin} min</span>
              </div>
              <div className="relative h-2 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.03]">
                <div
                  className="absolute inset-y-0 left-0 bg-[#8fb8ce] rounded-full transition-all"
                  style={{ width: `${((customDurationMin - 10) / (1440 - 10)) * 100}%` }}
                />
                <input
                  type="range"
                  min={10}
                  max={1440}
                  step={10}
                  value={customDurationMin}
                  onChange={(e) => setCustomDurationMin(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                />
              </div>
              <div className="flex justify-between text-[8.5px] text-slate-600 font-mono">
                <span>10 min</span><span>1440 min</span>
              </div>
            </div>
          )}
        </div>

        {/* Driving Behavior */}
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 shadow-lg shadow-black/10 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Driving Behavior</h4>
          </div>
          <div className="flex bg-black/35 rounded-xl p-1 border border-white/[0.06] gap-1.5">
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
                  className={`flex-1 py-2 text-center text-[10px] font-mono font-semibold transition-all border ${isActive
                    ? 'bg-white/[0.06] border-white/[0.08] text-slate-100 shadow'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}

const LAYOUT_OPTIONS = [
  {
    category: 'Standard Intersections',
    items: [
      { id: 'four_way', name: '4-Way Cross', emoji: '➕', desc: 'Standard cross junction with standard phases.' },
      { id: 't_junction', name: 'T-Junction', emoji: '┳', desc: 'Three-arm T-junction connecting a minor road to a major road.' },
      { id: 'y_junction', name: 'Y-Junction', emoji: '丫', desc: 'Three-arm junction merging/diverging lanes at an angle.' },
    ]
  },
  {
    category: 'Indian Style / Specialized',
    items: [
      { id: 'four_way_arrow', name: '4-Way Arrow Signals', emoji: '🔀', desc: 'Indian style arrow signal lights (straight, left, right).' },
      { id: 'four_way_protected_right', name: '4-Way Protected Right', emoji: '🛡️', desc: 'Indian style junction with dedicated protected right phases.' },
    ]
  },
  {
    category: 'Free-Left & Roundabouts',
    items: [
      { id: 'four_way_free_left', name: '4-Way (Free Left)', emoji: '↖️', desc: 'Standard cross with continuous slip lanes for left-turning traffic.' },
      { id: 't_junction_free_left', name: 'T-Junction (Free Left)', emoji: '🪓', desc: 'T-junction featuring a left-turn slip road to bypass signal timing.' },
      { id: 'roundabout', name: 'Roundabout', emoji: '🔄', desc: 'Traffic circle where entering traffic yields to vehicles in the circle.' },
    ]
  },
  {
    category: 'Advanced / Custom',
    items: [
      { id: 'custom', name: 'Custom Config (JSON)', emoji: '🛠️', desc: 'Direct JSON geometry definition for advanced designs.' }
    ]
  }
]

function SectionL({ isBaseline }: { isBaseline: boolean }) {
  const { simConfig, updateSimConfig, tabConfigs } = useConfigStore()

  const baselineConfig = tabConfigs.baseline || simConfig
  const isSyncActive = !isBaseline && !!simConfig.same_as_baseline
  const activeConfig = isSyncActive ? baselineConfig : simConfig

  const [customJsonText, setCustomJsonText] = useState(() => {
    return activeConfig.intersection_type === 'custom' ? JSON.stringify(activeConfig, null, 2) : '{}'
  })

  useEffect(() => {
    setCustomJsonText(activeConfig.intersection_type === 'custom' ? JSON.stringify(activeConfig, null, 2) : '{}')
  }, [activeConfig.intersection_type])

  const handleJsonChange = (text: string) => {
    if (isSyncActive) return
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

  return (
    <div className="space-y-6 pb-4 animate-fadeIn">
      {/* Lanes per Arm Selector */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 shadow-lg shadow-black/10 backdrop-blur-sm space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-0.5 h-4 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">Lanes per Arm</h4>
        </div>
        <div className="flex bg-black/35 rounded-xl p-1 border border-white/[0.06] gap-1.5 max-w-md">
          {[1, 2, 3, 4, 5].map((num) => {
            const isActive = (activeConfig.n_lanes ?? 3) === num
            return (
              <button
                key={num}
                type="button"
                disabled={isSyncActive}
                onClick={() => updateSimConfig({ n_lanes: num, lane_config: undefined })}
                className={`flex-grow py-2 rounded-lg text-center text-[11px] font-mono font-semibold transition-all border ${isActive
                    ? 'bg-white/[0.06] border-white/[0.08] text-slate-100 shadow'
                    : isSyncActive
                      ? 'border-transparent text-slate-655 opacity-40 cursor-not-allowed'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
              >
                {num} {num === 3 ? 'Lanes (Std)' : num === 1 ? 'Lane' : 'Lanes'}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['N', 'S', 'E', 'W'] as const).map((arm) => {
            const laneConfig = activeConfig.lane_config ?? {}
            const active = laneConfig[arm] ?? activeConfig.n_lanes ?? 3
            return (
              <div key={arm} className="flex items-center gap-1.5 rounded-lg border border-white/[0.04] bg-black/20 px-2 py-1.5">
                <span className="w-4 text-[10px] font-bold font-mono text-slate-400">{arm}</span>
                <div className="flex flex-1 gap-1">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      disabled={isSyncActive}
                      onClick={() => updateSimConfig({ lane_config: { ...laneConfig, [arm]: num } })}
                      className={`h-5 flex-1 rounded text-[9px] font-bold font-mono transition-all ${active === num
                          ? 'bg-[#8fb8ce]/20 text-[#c5e3f0] border border-[#8fb8ce]/35'
                          : isSyncActive
                            ? 'text-slate-700 cursor-not-allowed border border-transparent'
                            : 'text-slate-600 hover:text-slate-300 border border-transparent'
                        }`}
                      title={`${arm} arm ${num} lane${num === 1 ? '' : 's'}`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-slate-500 font-sans leading-normal">
          Defines the number of approach and departure lanes per arm. Hyderabad corridors average 3–4 lanes.
        </p>
      </div>

      {/* Grid of visual cards categorized */}
      <div className="space-y-5">
        {LAYOUT_OPTIONS.map((cat) => (
          <div key={cat.category} className="space-y-3">
            <h5 className="text-[10.5px] font-bold text-slate-500 uppercase tracking-widest font-mono pl-1">
              {cat.category}
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {cat.items.map((opt) => {
                const isActive = activeConfig.intersection_type === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isSyncActive}
                    onClick={() => updateSimConfig({ intersection_type: opt.id as any })}
                    className={`group rounded-xl border p-4 text-left transition-all duration-200 relative overflow-hidden flex items-start gap-3.5 ${isActive
                        ? 'border-[#8fb8ce]/40 bg-[#8fb8ce]/[0.06] shadow-[0_0_20px_rgba(143,184,206,0.15),inset_0_1px_0_rgba(255,255,255,0.05)]'
                        : isSyncActive
                          ? 'border-white/[0.02] bg-[#0c0e14]/20 opacity-40 cursor-not-allowed select-none'
                          : 'border-white/[0.04] bg-[#0c0e14]/50 hover:border-[#8fb8ce]/20 hover:bg-[#0c0e14]/80'
                      }`}
                  >
                    <div className={`text-2xl w-10 h-10 rounded-xl flex items-center justify-center border transition-all flex-shrink-0 ${isActive
                        ? 'bg-[#8fb8ce]/20 border-[#8fb8ce]/30 text-white'
                        : 'bg-black/30 border-white/[0.04] text-slate-500'
                      }`}>
                      {opt.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[12.5px] font-bold ${isActive ? 'text-slate-100' : 'text-slate-300'}`}>
                          {opt.name}
                        </span>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8fb8ce] animate-pulse" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 leading-relaxed line-clamp-2 font-medium">
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Custom JSON TEXTAREA if custom is selected */}
      {activeConfig.intersection_type === 'custom' && (
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5 shadow-lg shadow-black/10 backdrop-blur-sm space-y-3 animate-fadeIn">
          <label className="text-[11.5px] text-slate-400 font-semibold block font-mono">Custom JSON Config</label>
          <textarea
            className="w-full bg-[#050508] border border-white/[0.06] rounded-xl p-3.5 text-[11px] text-slate-350 focus:outline-none focus:border-[#8fb8ce]/40 font-mono leading-relaxed shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.5)]"
            rows={5}
            value={customJsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            disabled={isSyncActive}
          />
          <p className="text-[9.5px] text-slate-500 font-sans">
            Specify customized links, lanes, phase signals, and coordinates in standard simulator-compatible format.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main ConfigModal ─────────────────────────────────────────────────────────
interface ConfigModalProps {
  open: boolean
  mode?: 'simulation' | 'training'
  onClose: () => void
  onApply?: () => void
  isBaselineView?: boolean
  activeModelKey?: string
}

export default function ConfigModal({ open, mode = 'simulation', onClose, onApply, isBaselineView = false, activeModelKey = 'custom' }: ConfigModalProps) {
  const { simConfig, adverseConfig, updateSimConfig, updateAdverseConfig, isDirty } = useConfigStore()
  const isRunning = useSimulationStore((s) => s.isRunning)

  const [activeSection, setActiveSection] = useState('J')

  // Ensure correct tab active when opening/switching view modes
  useEffect(() => {
    if (open) {
      if (mode === 'training') {
        setActiveSection('E')
      } else if (isBaselineView && activeSection === 'E') {
        setActiveSection('D')
      } else if (!isBaselineView && activeSection === 'D') {
        setActiveSection('E')
      }
    }
  }, [open, isBaselineView, activeSection, mode])

  // Dynamically filter sections in NAV_GROUPS based on baseline view
  const navGroups = ALL_NAV_GROUPS.map((group) => {
    if (group.id === 'control') {
      return {
        ...group,
        sections: group.sections.filter((s) => {
          if (isBaselineView) {
            return s.id !== 'E' // hide RL Training for baseline
          } else {
            return s.id !== 'D' // hide Signal Timing for RL
          }
        }),
      }
    }
    return group
  })

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
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base border border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
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
            {navGroups.map((group) => (
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
                      className={`w-full text-left flex items-center gap-3 px-5 py-2 transition-all duration-200 relative ${isActive
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
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[11.5px] font-bold transition-all duration-300 border ${changesCount > 0
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
          <div className="flex items-center justify-between px-6 border-b border-white/[0.05] flex-shrink-0 bg-black/5 h-[72px]">
            <div className="flex items-center gap-3.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base border border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
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
          <div className={`flex-1 overflow-y-auto custom-scrollbar px-6 py-6 ${isRunning ? 'pointer-events-none opacity-40 select-none' : ''}`}>
            {activeSection === 'D' && <SectionD simConfig={simConfig} updateSimConfig={updateSimConfig} />}
            {activeSection === 'E' && <SectionE simConfig={simConfig} updateSimConfig={updateSimConfig} activeModelKey={activeModelKey} />}
            {activeSection === 'F' && <SectionF simConfig={simConfig} updateSimConfig={updateSimConfig} />}
            {activeSection === 'H' && <SectionH simConfig={simConfig} updateSimConfig={updateSimConfig} />}
            {activeSection === 'I' && <SectionI adverseConfig={adverseConfig} updateAdverseConfig={updateAdverseConfig} />}
            {activeSection === 'J' && <SectionJ isBaseline={isBaselineView} />}
            {activeSection === 'L' && <SectionL isBaseline={isBaselineView} />}
          </div>

          {/* Footer: Apply */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-white/[0.05] flex items-center justify-between bg-[#050508]"
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
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[12px] font-bold transition-all duration-300 border shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] ${isRunning
                  ? 'bg-white/[0.01] border-white/[0.03] text-slate-600 cursor-not-allowed'
                  : mode === 'training'
                    ? 'bg-emerald-950/70 border-emerald-400/20 text-emerald-400 hover:bg-emerald-900/60 hover:border-emerald-400/45 hover:text-emerald-300 hover:shadow-[0_0_16px_rgba(52,211,153,0.15)] cursor-pointer'
                    : 'bg-[#8fb8ce]/[0.09] border-[#8fb8ce]/25 text-[#8fb8ce]/90 hover:bg-[#8fb8ce]/[0.15] hover:border-[#8fb8ce]/45 hover:text-[#8fb8ce] hover:shadow-[0_0_16px_rgba(143,184,206,0.15)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] cursor-pointer'
                  }`}
              >
                {mode === 'training' ? (
                  <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="currentColor">
                    <polygon points="3,2 11,7 3,12" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="2,7 6,11 12,3" />
                  </svg>
                )}
                {mode === 'training' ? 'Apply & Start Training' : 'Apply & Update Simulation'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
