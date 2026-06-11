import React, { useState } from 'react'
import HelpPopover from './HelpPopover'
import { useSimulationStore } from '../store/simulationStore'
import { useSessionStore } from '../store/sessionStore'
import { useConfigStore } from '../store/configStore'
import { MODEL_METADATA } from '../utils/constants'

const BASELINE_CONTROLLER_OPTIONS = [
  { value: 'fixed_time', label: 'Fixed-Time', desc: 'Static 30s cycles. Improvements #1 #3 #4 #5.' },
  { value: 'websters', label: "Webster's", desc: 'Adaptive cycles. All improvements + #2 BC warmup.' },
] as const

interface RLConfigDetailsPanelProps {
  modelKey: string
}

export default function RLConfigDetailsPanel({ modelKey }: RLConfigDetailsPanelProps) {
  const trainedModels = useSimulationStore((s) => s.trainedModels)
  const isTraining = useSessionStore((s) => s.isTraining)
  const trainingModelKey = useSessionStore((s) => s.trainingModelKey)
  const baselineData = useSessionStore((s) => s.baselineData)
  const selectedModelSingle = useSimulationStore((s) => s.selectedModelSingle)
  const currentFrame = useSimulationStore((s) => s.currentFrame)
  const isRunning = useSimulationStore((s) => s.isRunning)
  const { simConfig, activePreset, updateSimConfig } = useConfigStore()

  // State to toggle weights collapse (closed by default to save massive vertical space)
  const [isWeightsOpen, setIsWeightsOpen] = useState(false)

  const selectedController = (simConfig.baseline_controller ?? 'fixed_time') as 'fixed_time' | 'websters'

  // Base configurations of the agents
  const agentConfigs: Record<
    string,
    {
      algo: string
      policyType: string
      optimizer: string
      epochs: number
      batchSize: number
      actuation: string
      description: string
      lrDefault: number
      gammaDefault: number
      layersDefault: string
    }
  > = {
    baseline: {
      algo: 'Fixed Time (Webster Rules)',
      policyType: 'Static Timing Cycles',
      optimizer: 'N/A (Deterministic)',
      epochs: 0,
      batchSize: 0,
      actuation: 'Fixed: Cycle=120s, Yellow=4s, All-Red=2s',
      description: 'Traditional pre-timed traffic controller. Uses a deterministic round-robin phase sequence with static green splits based on historical peak volumes.',
      lrDefault: 0,
      gammaDefault: 0,
      layersDefault: 'None',
    },
    rl1: {
      algo: 'PPO (Proximal Policy Optimization)',
      policyType: 'Actor-Critic MLP (On-Policy)',
      optimizer: 'Adam Optimizer',
      epochs: 10,
      batchSize: 64,
      actuation: 'Min Green: 8s | Max Green: 35s',
      description: 'Clipping-based policy gradient optimizer. Highly stable policy updates designed to handle stochastic vehicle arrivals smoothly.',
      lrDefault: 0.0003,
      gammaDefault: 0.99,
      layersDefault: '64x64 Nodes (Balanced)',
    },
    rl2: {
      algo: 'DQN (Deep Q-Network)',
      policyType: 'Discrete action Q-Network (Off-Policy)',
      optimizer: 'Adam Optimizer',
      epochs: 4,
      batchSize: 32,
      actuation: 'Min Green: 6s | Max Green: 30s',
      description: 'Aggressive value-based reinforcement learning. Explores discrete phase combinations rapidly to optimize short-term queue clearances.',
      lrDefault: 0.0001,
      gammaDefault: 0.95,
      layersDefault: '128x128 Nodes (Large)',
    },
    rl3: {
      algo: 'SAC (Soft Actor-Critic)',
      policyType: 'Gaussian Policy Actor-Critic (Off-Policy)',
      optimizer: 'Adam Optimizer',
      epochs: 8,
      batchSize: 128,
      actuation: 'Min Green: 10s | Max Green: 40s',
      description: 'Entropy-regularized continuous control. Holds green phases conservatively when high queue dispersion is detected to guarantee stability.',
      lrDefault: 0.0003,
      gammaDefault: 0.98,
      layersDefault: '256x256 Nodes (Heavy)',
    },
    rl4: {
      algo: 'A2C (Advantage Actor-Critic)',
      policyType: 'Synchronous Advantage Policy Gradient',
      optimizer: 'RMSprop Optimizer',
      epochs: 5,
      batchSize: 16,
      actuation: 'Min Green: 5s | Max Green: 25s',
      description: 'Highly responsive coordinate-less learning. Dynamically balances green timing slices in real-time, executing fast micro-corrections.',
      lrDefault: 0.0007,
      gammaDefault: 0.99,
      layersDefault: '32x32 Nodes (Light)',
    },
    custom: {
      algo: 'Custom Agent Configuration',
      policyType: 'User-Defined Neural Policy',
      optimizer: 'Adam Optimizer',
      epochs: 8,
      batchSize: 64,
      actuation: 'Sliders Controlled Timing Splits',
      description: 'Fully customizable reinforcement learning agent. Customize network hyperparameters and reward weights in the right sidebar Config panel to dynamically shape learning splits.',
      lrDefault: 0.0003,
      gammaDefault: 0.99,
      layersDefault: 'Dynamic Nodes',
    },
  }

  const isModelTraining = isTraining && trainingModelKey === modelKey
  const isModelTrained = trainedModels.includes(modelKey)
  const meta = MODEL_METADATA[modelKey] ?? { label: modelKey, color: '#fff', indicatorColor: 'bg-gray-400' }
  const config = agentConfigs[modelKey] ?? agentConfigs.baseline

  // Get active signal timing information
  const activeSignal = currentFrame?.signals?.[0]
  const currentPhaseIdx = activeSignal?.phase ?? 0
  const elapsed = activeSignal?.elapsed_s ?? 0.0
  const duration = activeSignal?.duration_s ?? 28.0

  // The Webster pre-timed baseline cycle for Phase 0 and 2 is always exactly 28.0 seconds green
  const websterStaticTime = (currentPhaseIdx === 0 || currentPhaseIdx === 2) ? 28.0 : 4.0

  // Decide active timing details based on modelKey
  const isBaseline = modelKey === 'baseline'

  // Visual text calculations: explain what policy action is currently executing
  let strategyExplain = 'Awaiting simulation start to begin timing search...'
  if (isRunning) {
    if (isBaseline) {
      strategyExplain = `Webster controller executing rigid pre-calculated static split. Cycling to Phase ${currentPhaseIdx} regardless of queues.`
    } else {
      if (currentPhaseIdx === 0) {
        if (duration > 28.0) {
          strategyExplain = `${meta.label} has dynamically EXTENDED the North-South green light to ${duration.toFixed(1)}s (exceeding Webster static 28s) to clear heavy queue build-up.`
        } else if (elapsed > 8.0 && duration < 28.0) {
          strategyExplain = `${meta.label} detected North-South approach was empty. Dynamically TERMINATED green early at ${duration.toFixed(1)}s to clear perpendicular waiting traffic.`
        } else {
          strategyExplain = `${meta.label} actively auditing N-S queues to iteratively converge on the absolute optimal green light split.`
        }
      } else if (currentPhaseIdx === 2) {
        if (duration > 28.0) {
          strategyExplain = `${meta.label} has dynamically EXTENDED the East-West green light to ${duration.toFixed(1)}s (exceeding Webster static 28s) to clear heavy queue build-up.`
        } else if (elapsed > 8.0 && duration < 28.0) {
          strategyExplain = `${meta.label} detected East-West approach was empty. Dynamically TERMINATED green early at ${duration.toFixed(1)}s to clear perpendicular waiting traffic.`
        } else {
          strategyExplain = `${meta.label} actively auditing E-W queues to iteratively converge on the absolute optimal green light split.`
        }
      } else {
        strategyExplain = `${meta.label} cycling yellow/all-red clearance state. Re-evaluating next approach weights.`
      }
    }
  }

  // Extract weights dynamically from configStore
  const weights = [
    { label: 'Queue Penalty', val: simConfig.reward_wt_queue ?? 1.0, key: 'reward_wt_queue', desc: 'Penalizes vehicle accumulation per approach arm' },
    { label: 'Wait Delay Penalty', val: simConfig.reward_wt_wait ?? 0.5, key: 'reward_wt_wait', desc: 'Penalizes cumulative delay seconds experienced by stopped cars' },
    { label: 'Throughput Bonus', val: simConfig.reward_wt_throughput ?? 2.0, key: 'reward_wt_throughput', desc: 'Credits the agent for every vehicle cleared from intersection' },
    { label: 'Collision Penalty', val: simConfig.reward_wt_collision ?? 1.5, key: 'reward_wt_collision', desc: 'Severe penalty if vehicles enter critical conflict grid' },
    { label: 'Pedestrian Safety Penalty', val: simConfig.reward_wt_pedestrian ?? 0.8, key: 'reward_wt_pedestrian', desc: 'Penalty for conflicts near zebra crossings' },
    { label: 'Emergency Preemption Bonus', val: simConfig.reward_wt_emergency ?? 0.5, key: 'reward_wt_emergency', desc: 'Bonus for immediately clearing lanes with sirens' },
    { label: 'Phase Switch Penalty', val: simConfig.reward_wt_switch ?? 0.15, key: 'reward_wt_switch', desc: 'Slight penalty on phase changes to prevent flickering signals' },
  ]

  // Render dynamic values based on config store when they match, otherwise default
  const isSameAsBaseline = modelKey !== 'baseline' && modelKey === selectedModelSingle && simConfig.rl_algorithm === 'Same as Baseline'
  const activeLr = (modelKey === 'baseline' || isSameAsBaseline) ? 0 : modelKey === selectedModelSingle ? simConfig.learning_rate : config.lrDefault
  const activeGamma = (modelKey === 'baseline' || isSameAsBaseline) ? 0 : modelKey === selectedModelSingle ? (simConfig.discount_factor ?? 0.99) : config.gammaDefault
  const activeLayers = (modelKey === 'baseline' || isSameAsBaseline) ? 'None' : modelKey === selectedModelSingle ? `${simConfig.hidden_layer_size ?? 64}x${simConfig.hidden_layer_size ?? 64} Nodes` : config.layersDefault

  return (
    <div className="w-[560px] flex-shrink-0 h-[560px] bg-gradient-to-b from-[#0e131c] to-[#0a0e15] backdrop-blur-md border border-white/[0.07] rounded-2xl p-5 flex flex-col justify-start gap-3.5 shadow-2xl select-none hover:border-white/[0.12] transition-all duration-300 overflow-y-auto custom-scrollbar">

      {/* 🟢 HEADER INFO */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${meta.indicatorColor} shadow-[0_0_6px_currentColor] ${isModelTraining ? 'animate-ping' : ''}`} />
            <h3 className="text-sm font-black font-mono uppercase tracking-wider flex items-center gap-1.5" style={{ color: meta.color }}>
              <span>{meta.label}</span>
              {modelKey === 'baseline' && activePreset && (
                <span className="text-[10.5px] text-gray-500 font-bold uppercase tracking-wider font-mono normal-case">
                  — {activePreset.name}
                </span>
              )}
            </h3>
          </div>

          {/* Status Badge */}
          {modelKey === 'baseline' ? (
            <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              Deterministic
            </span>
          ) : isModelTraining ? (
            <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 animate-pulse">
              Training Active
            </span>
          ) : isModelTrained ? (
            <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Trained and Ready
            </span>
          ) : (
            <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
              Untrained
            </span>
          )}
        </div>

        <p className="text-xs text-gray-300 leading-relaxed font-sans font-medium">
          {config.description}
        </p>
      </div>


      {/* ⚙️ TRAINING CONFIGURATION HYPERPARAMETERS */}
      <div className="border-t border-gray-800/60 pt-3 space-y-2">
        <h4 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest font-mono flex items-center gap-1">
          Network Hyperparameters
          <HelpPopover text="### Network Hyperparameters\nThe deep neural network structure driving signal timings:\n- **Algorithm**: The core Reinforcement Learning optimizer (e.g. PPO, DQN, SAC, A2C).\n- **Policy Net**: MLP mapping spatial states to action weights.\n- **Learning Rate**: Step speed coefficient for model updates.\n- **Discount (γ)**: Horizon index weighting future traffic rewards." position="top" />
        </h4>

        {/* Baseline controller selector — only shown in baseline config panel */}
        {modelKey === 'baseline' && (
          <div className="mb-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-widest text-gray-500 font-mono font-bold">
                Baseline Controller
              </span>
              {baselineData && (
                <span className="text-[8.5px] font-mono text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Computed · {baselineData.mean_wait.toFixed(1)}s wait
                </span>
              )}
            </div>
            <div className="flex gap-1.5 bg-black/30 border border-white/[0.06] rounded-xl p-1">
              {BASELINE_CONTROLLER_OPTIONS.map((opt) => {
                const isActive = selectedController === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => updateSimConfig({ baseline_controller: opt.value })}
                    disabled={isRunning}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wide border transition-colors duration-150 ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'border-transparent text-gray-600 hover:text-gray-400'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 text-[11px] font-mono leading-tight">
          <div className="bg-gray-950/70 border border-gray-800/50 rounded-xl p-2.5 flex flex-col justify-center gap-1 shadow-inner">
            <span className="text-[8px] text-gray-500 font-extrabold tracking-wider uppercase">Algorithm</span>
            <span className="text-gray-200 font-bold truncate text-[11.5px]">
              {modelKey === 'baseline'
                ? (selectedController === 'websters' ? "Webster's" : 'Fixed-Time')
                : (simConfig.rl_algorithm === 'Same as Baseline'
                  ? `Baseline (${selectedController === 'websters' ? "Webster's" : 'Fixed-Time'})`
                  : config.algo.split(' ')[0])}
            </span>
          </div>

          <div className="bg-gray-950/70 border border-gray-800/50 rounded-xl p-2.5 flex flex-col justify-center gap-1 shadow-inner">
            <span className="text-[8px] text-gray-500 font-extrabold tracking-wider uppercase">Policy Net</span>
            <span className="text-gray-200 font-bold truncate text-[11.5px]" title={config.policyType}>
              {isSameAsBaseline ? 'N/A' : config.policyType.split(' ')[0]}
            </span>
          </div>

          <div className="bg-gray-950/70 border border-gray-800/50 rounded-xl p-2.5 flex flex-col justify-center gap-1 shadow-inner">
            <span className="text-[8px] text-gray-500 font-extrabold tracking-wider uppercase">Learning Rate</span>
            <span className="text-cyan-400 font-bold text-[11.5px]">{activeLr > 0 ? activeLr.toFixed(5) : 'N/A'}</span>
          </div>

          <div className="bg-gray-950/70 border border-gray-800/50 rounded-xl p-2.5 flex flex-col justify-center gap-1 shadow-inner">
            <span className="text-[8px] text-gray-500 font-extrabold tracking-wider uppercase">Discount (γ)</span>
            <span className="text-cyan-400 font-bold text-[11.5px]">{activeGamma > 0 ? activeGamma.toFixed(3) : 'N/A'}</span>
          </div>

          <div className="bg-gray-950/70 border border-gray-800/50 rounded-xl p-2.5 flex flex-col justify-center gap-1 shadow-inner">
            <span className="text-[8px] text-gray-500 font-extrabold tracking-wider uppercase">Layers MLP</span>
            <span className="text-gray-200 font-bold truncate text-[11.5px]">
              {isSameAsBaseline ? 'None' : activeLayers.replace(' Nodes', '')}
            </span>
          </div>

          <div className="bg-gray-950/70 border border-gray-800/50 rounded-xl p-2.5 flex flex-col justify-center gap-1 shadow-inner">
            <span className="text-[8px] text-gray-500 font-extrabold tracking-wider uppercase">Optimizer</span>
            <span className="text-gray-200 font-bold truncate text-[11.5px]">
              {(modelKey === 'baseline' || isSameAsBaseline) ? 'N/A' : `${config.optimizer.split(' ')[0]} (${config.epochs}e)`}
            </span>
          </div>
        </div>

        {modelKey === 'baseline' && (
          <div className="bg-emerald-950/15 border border-emerald-900/30 rounded-xl p-2.5 text-xs font-mono flex items-center justify-between shadow-inner">
            <span className="text-[8.5px] text-emerald-400/80 font-extrabold tracking-wider uppercase">Timing Constraints</span>
            <span className="text-emerald-400 font-bold text-[11px]">{config.actuation.replace('Min Green:', 'Min:').replace('| Max Green:', '/ Max:')}</span>
          </div>
        )}
      </div>



      {/* 🧠 REWARD SHAPING "PERSONALITY" FORMULATION */}
      <div className="border-t border-gray-800/60 pt-2.5 space-y-2">
        <button
          type="button"
          className="w-full flex justify-between items-center focus:outline-none group select-none"
          onClick={() => setIsWeightsOpen(!isWeightsOpen)}
        >
          <h4 className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest font-mono group-hover:text-gray-200 transition-colors flex items-center gap-1">
            Optimisation Weights Split
            <HelpPopover text="### Optimisation Weights Split\nDefines the reward formulation weights guiding the learning agent:\n- **Reward Formula**:\n$$R_t = - ( w_q Q_t + w_w W_t + w_c C_t + w_s S_t ) + w_t T_t$$\nWhere weights $w$ balance queue penalties $Q$, delays $W$, collisions $C$, phase switches $S$, and throughput gains $T$." position="top" />
          </h4>
          <span className="text-[9px] font-mono text-cyan-400 font-bold bg-cyan-950/30 border border-cyan-800/30 px-2.5 py-0.5 rounded-lg group-hover:bg-cyan-900/40 transition-all shadow-sm">
            {(modelKey === 'baseline' || isSameAsBaseline) ? 'None (Static)' : isWeightsOpen ? 'Hide Weights' : 'View Weights'}
          </span>
        </button>

        {isWeightsOpen && (
          (modelKey === 'baseline' || isSameAsBaseline) ? (
            <div className="h-24 bg-gray-950/30 border border-gray-950 rounded-2xl flex flex-col items-center justify-center text-center p-3 mt-2 shadow-inner">
              <span className="text-[10px] uppercase tracking-wider text-gray-400">Static Profile</span>
              <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed max-w-[200px] mx-auto">
                Webster Fixed-time models operate under pre-calculated green cycle intervals.
                No reward-shaping parameters are evaluated.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 bg-gray-950/60 border border-gray-850 p-3.5 rounded-2xl mt-2 animate-fadeIn shadow-inner">
              {weights.map((w) => {
                const maxWt = 5.0
                const pct = (w.val / maxWt) * 100
                const isPenalty = w.label.includes('Penalty')
                const barColor = isPenalty ? 'bg-gradient-to-r from-red-600 to-red-500' : 'bg-gradient-to-r from-emerald-600 to-emerald-500'

                return (
                  <div key={w.key} className="flex flex-col gap-1 group">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-gray-300 font-semibold tracking-wide flex items-center gap-1 font-sans" title={w.desc}>
                        {w.label}
                      </span>
                      <span className="font-mono text-gray-100 font-bold text-[10.5px]">{w.val.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-900 border border-gray-950 rounded-full overflow-hidden shadow-inner">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
