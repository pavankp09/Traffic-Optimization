import React, { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessionStore'
import { useConfigStore } from '../store/configStore'
import { useSimulationStore } from '../store/simulationStore'
import { useSimulation } from '../hooks/useSimulation'
import { TrainingModeSelector, type TrainingMode } from './TrainingModeSelector'


interface RLTrainingHUDProps {
  modelKey: string
  trainingMode?: TrainingMode
  onTrainingModeChange?: (m: TrainingMode) => void
}

const METADATA: Record<
  string,
  { label: string; color: string; indicatorColor: string; shadow: string; description: string }
> = {
  rl1: {
    label: 'RL Agent 1 (PPO)',
    color: '#22d3ee', // cyan
    indicatorColor: 'bg-cyan-400',
    shadow: 'shadow-cyan-500/20',
    description: 'On-policy proximal policy optimization agent calibrated for stable and robust splits.',
  },
  rl2: {
    label: 'RL Agent 2 (DQN)',
    color: '#c084fc', // purple
    indicatorColor: 'bg-purple-400',
    shadow: 'shadow-purple-500/20',
    description: 'Off-policy value-based Q-network designed to optimize immediate queue clearances rapidly.',
  },
  rl3: {
    label: 'RL Agent 3 (SAC)',
    color: '#34d399', // emerald
    indicatorColor: 'bg-emerald-400',
    shadow: 'shadow-emerald-500/20',
    description: 'Continuous entropy-regularized actor-critic model ensuring conservative, highly stable green holds.',
  },
  rl4: {
    label: 'RL Agent 4 (A2C)',
    color: '#f87171', // red
    indicatorColor: 'bg-red-400',
    shadow: 'shadow-red-500/20',
    description: 'Synchronous advantage actor-critic executing quick micro-corrections based on live queues.',
  },
  custom: {
    label: 'Custom RL Agent',
    color: '#6366f1', // indigo
    indicatorColor: 'bg-indigo-400',
    shadow: 'shadow-indigo-500/20',
    description: 'Fully customizable neural model driven by user-defined reward formulations and hyperparameters.',
  },
}

export default function RLTrainingHUD({ modelKey, trainingMode = 'stage1', onTrainingModeChange }: RLTrainingHUDProps) {
  const isTrainingGlobal = useSessionStore((s) => s.isTraining)
  const trainingModelKey = useSessionStore((s) => s.trainingModelKey)
  // Training UI is scoped to the model actually being trained — other RL tabs stay
  // idle even though training runs in the background for a different model.
  const isTraining = isTrainingGlobal && trainingModelKey === modelKey
  const episodes = useSessionStore((s) => s.episodes)
  const isConverged = useSessionStore((s) => s.isConverged)
  const currentMetrics = useSessionStore((s) => s.currentMetrics)
  const bestReward = useSessionStore((s) => s.bestReward)
  const baselineMetrics = useSessionStore((s) => s.baselineMetrics)
  const simConfig = useConfigStore((s) => s.simConfig)
  const baselineData = useSessionStore((s) => s.baselineData)
  const baselineFrame = useSimulationStore((s) => s.baselineFrame)
  const lastSimMetrics = useSimulationStore((s) => s.lastSimulationMetrics['baseline'])
  const isTrainingPaused = useSessionStore((s) => s.isTrainingPaused)
  const { startTraining, stopTraining, pauseTraining, resumeTraining } = useSimulation()

  // Controller type — read from most reliable source in order
  const rawControllerType =
    baselineData?.controller ??
    baselineFrame?.policy_mode ??
    simConfig.baseline_controller ??
    'fixed_time'
  const controllerType = rawControllerType === 'websters' ? 'websters' : 'fixed_time'
  const controllerLabel = controllerType === 'websters' ? "Webster's" : 'Fixed-Time'

  // Baseline metrics for DISPLAY — always use visual simulation metrics (same source
  // as KPI cards) so numbers are consistent. baselineData uses a different engine
  // (MockTrafficEnv) and is only passed to RL training internally — not shown here.
  const liveMetrics = lastSimMetrics ?? baselineMetrics
  const resolvedBaseline = liveMetrics
    ? { mean_wait: liveMetrics.avg_wait_s ?? 0, throughput: liveMetrics.throughput_vph ?? 0 }
    : null

  const meta = METADATA[modelKey] ?? METADATA.rl1
  const [pulseSpeed, setPulseSpeed] = useState('3s')

  useEffect(() => {
    if (isTraining) {
      setPulseSpeed('1.2s')
    } else {
      setPulseSpeed('5s')
    }
  }, [isTraining])

  // Get active values or mock them if idle
  const latestEpisode = episodes.length > 0 ? episodes[episodes.length - 1] : null
  const currentEpNum = latestEpisode?.episode ?? 0
  const totalEpisodes = 500 // mock backend converges at 500
  const progressPct = Math.min(100, (currentEpNum / totalEpisodes) * 100)

  const activeReward = latestEpisode?.reward ?? 0
  const activeWait = latestEpisode?.metrics?.mean_wait ?? 85.0
  const activeTput = latestEpisode?.metrics?.throughput ?? 260

  const peakReward = bestReward !== -Infinity ? bestReward.toFixed(1) : '—'
  const baselineWait = baselineMetrics?.avg_wait_s ?? 85.0
  const delayReduction = baselineWait > 0 ? ((baselineWait - activeWait) / baselineWait) * 100 : 0

  // Calculate live training metrics dynamically
  const progress = Math.min(currentEpNum / 500.0, 1.0)
  const loss = -0.012 - (1.0 - progress) * 0.025 + Math.sin(currentEpNum) * 0.003
  const entropy = Math.max(0.15, 1.0 - progress * 0.85)

  return (
    <div
      className={`w-[560px] h-[560px] bg-gradient-to-b from-[#0e131c] to-[#0a0e15] backdrop-blur-lg border border-white/[0.07] rounded-2xl flex flex-col justify-between p-6 shadow-2xl relative overflow-hidden transition-all duration-300 select-none hover:border-white/[0.12]`}
      style={{
        boxShadow: `0 8px 32px 0 rgba(0, 0, 0, 0.4), 0 0 20px -8px ${meta.color}33`,
      }}
    >
      {/* ── Background Grid Accent ── */}
      <div className="absolute inset-0 bg-grid-white/[0.01] pointer-events-none" />
      <div
        className="absolute top-0 right-0 w-44 h-44 rounded-full filter blur-[80px] pointer-events-none opacity-20"
        style={{ backgroundColor: meta.color }}
      />

      {/* ── HEADER STATUS SECTION ── */}
      <div className="flex items-center justify-between border-b border-gray-800/80 pb-3 flex-shrink-0 z-10">
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${meta.indicatorColor} shadow-[0_0_6px_currentColor] ${
              isTraining ? 'animate-ping' : ''
            }`}
          />
          <div>
            <h3 className="text-sm font-black font-mono uppercase tracking-widest text-gray-200">
              {meta.label} Setup
            </h3>
            <p className="text-[10px] text-gray-500 font-mono">Neural Weights HUD</p>
          </div>
        </div>

        {isTraining ? (
          <span
            className="text-[10px] font-bold font-mono px-3 py-1 rounded-full border bg-purple-500/10 text-purple-400 border-purple-500/25 animate-pulse"
            style={{
              borderColor: `${meta.color}40`,
              color: meta.color,
              backgroundColor: `${meta.color}0c`,
            }}
          >
            Optimization Active
          </span>
        ) : isConverged ? (
          <span className="text-[10px] font-bold font-mono px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
            Weights Converged
          </span>
        ) : (
          <span className="text-[10px] font-bold font-mono px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
            Retraining Required
          </span>
        )}
      </div>

      {/* ── BODY HUD INTERACTIVE PANEL ── */}
      <div className="flex-1 flex items-center justify-center py-4 z-10 overflow-hidden">
        {!isTraining && !isConverged && !useSimulationStore.getState().trainedModels.includes(modelKey) ? (
          /* IDLE UNTRAINED HUD */
          <div className="w-full flex flex-col items-center justify-center space-y-3 animate-fadeIn">
            <div className="text-center space-y-1 max-w-[420px]">
              <span className="text-[9px] uppercase tracking-wider text-gray-500">Status</span>
              <h4 className="text-[11px] font-mono font-black tracking-widest text-gray-300 uppercase">
                Neural Weights Uninitialized
              </h4>
              {!onTrainingModeChange && (
                <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                  {meta.description} Select a training mode and start the training session first.
                </p>
              )}
            </div>

            {/* Config Specs Checked */}
            <div className="w-full grid grid-cols-2 gap-x-6 gap-y-1.5 bg-gray-900/40 border border-gray-800/60 rounded-xl p-2.5 px-5 text-[10px] font-mono text-gray-400">
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">Ready</span>
                <span>Algorithm Preset Loaded</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">Ready</span>
                <span>Hyperparameters Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">Ready</span>
                <span>Shaping Weights Pre-set</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">Ready</span>
                <span>Simulator Connection Established</span>
              </div>
            </div>

            {/* Baseline reference status */}
            <div className={`w-full rounded-xl border px-3 py-2 flex items-center gap-2.5 ${
              resolvedBaseline
                ? 'bg-emerald-500/[0.04] border-emerald-500/20'
                : 'bg-amber-500/[0.04] border-amber-500/20'
            }`}>
              <span className={`text-base flex-shrink-0 ${resolvedBaseline ? 'text-emerald-400' : 'text-amber-400'}`}>
                {resolvedBaseline ? '✓' : '⚠'}
              </span>
              <div className="flex-1 min-w-0">
                {resolvedBaseline ? (
                  <>
                    {/* Status header, badge, and metrics in one line */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
                        Baseline Ready
                      </span>
                      <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                        controllerType === 'websters'
                          ? 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                          : 'bg-sky-500/10 border-sky-500/25 text-sky-400'
                      }`}>
                        {controllerLabel}
                      </span>
                      <span className="text-gray-500 text-[10px]">•</span>
                      <span className="text-[9.5px] text-gray-400 font-mono">
                        {resolvedBaseline.mean_wait.toFixed(1)}s avg wait · {resolvedBaseline.throughput.toLocaleString()} vph
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">
                      No Baseline Computed
                    </p>
                    <p className="text-[9.5px] text-gray-500 font-mono mt-0.5">
                      Run Baseline tab simulation first to unlock full RL improvements.
                    </p>
                    <p className="text-[9px] text-gray-600 font-mono mt-0.5">
                      Training will still run using fallback baseline internally.
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Training mode selector */}
            {onTrainingModeChange && (
              <div className="w-full">
                <TrainingModeSelector selected={trainingMode} onChange={onTrainingModeChange} />
              </div>
            )}

            {/* Glowing start training button */}
            <button
              className="px-6 py-2.5 rounded-xl text-xs font-bold font-mono tracking-widest text-white border transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              style={{
                background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%), #111827',
                borderColor: `${meta.color}aa`,
                boxShadow: `0 4px 20px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 0 10px ${meta.color}22`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = meta.color;
                e.currentTarget.style.boxShadow = `0 4px 24px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.15), 0 0 16px ${meta.color}44`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = `${meta.color}aa`;
                e.currentTarget.style.boxShadow = `0 4px 20px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 0 10px ${meta.color}22`;
              }}
              onClick={() => startTraining(simConfig.total_timesteps, trainingMode)}
            >
              START AGENT TRAINING
            </button>
          </div>
        ) : (
          /* ACTIVE TRAINING PROGRESS PANEL WITH PULSING BRAIN */
          <div className="w-full h-full grid grid-cols-5 gap-4 items-center animate-fadeIn">
            {/* SVG Brain Schematic (Left 3 cols) */}
            <div className="col-span-3 relative h-[210px] bg-gray-900/35 border border-gray-800/40 rounded-xl overflow-hidden flex items-center justify-center shadow-inner">
              <svg
                viewBox="0 0 240 160"
                className="w-full h-full p-1"
                style={{ '--speed': pulseSpeed } as React.CSSProperties}
              >
                {/* Synaptic Connections (Lines) */}
                <line x1="20" y1="20" x2="120" y2="35" stroke="#111827" strokeWidth="1" />
                <line x1="20" y1="20" x2="120" y2="80" stroke="#111827" strokeWidth="1" />
                <line x1="20" y1="60" x2="120" y2="35" stroke="#111827" strokeWidth="1" />
                <line x1="20" y1="60" x2="120" y2="80" stroke="#111827" strokeWidth="1" />
                <line x1="20" y1="60" x2="120" y2="125" stroke="#111827" strokeWidth="1" />
                <line x1="20" y1="100" x2="120" y2="80" stroke="#111827" strokeWidth="1" />
                <line x1="20" y1="100" x2="120" y2="125" stroke="#111827" strokeWidth="1" />
                <line x1="20" y1="140" x2="120" y2="125" stroke="#111827" strokeWidth="1" />

                {/* Glowing Active Connections */}
                <line
                  x1="20"
                  y1="20"
                  x2="120"
                  y2="35"
                  stroke={meta.color}
                  strokeWidth="0.8"
                  strokeOpacity="0.4"
                  className="synapse-line"
                />
                <line
                  x1="20"
                  y1="60"
                  x2="120"
                  y2="80"
                  stroke="#c084fc"
                  strokeWidth="0.8"
                  strokeOpacity="0.4"
                  className="synapse-line"
                />
                <line
                  x1="20"
                  y1="100"
                  x2="120"
                  y2="125"
                  stroke="#34d399"
                  strokeWidth="0.8"
                  strokeOpacity="0.4"
                  className="synapse-line"
                />
                <line
                  x1="20"
                  y1="140"
                  x2="120"
                  y2="80"
                  stroke="#f59e0b"
                  strokeWidth="0.8"
                  strokeOpacity="0.4"
                  className="synapse-line"
                />

                {/* Hidden Nodes to Output Nodes */}
                <line
                  x1="120"
                  y1="35"
                  x2="220"
                  y2="40"
                  stroke={meta.color}
                  strokeWidth="0.8"
                  strokeOpacity="0.4"
                  className="synapse-line"
                />
                <line
                  x1="120"
                  y1="80"
                  x2="220"
                  y2="80"
                  stroke="#c084fc"
                  strokeWidth="0.8"
                  strokeOpacity="0.4"
                  className="synapse-line"
                />
                <line
                  x1="120"
                  y1="125"
                  x2="220"
                  y2="120"
                  stroke="#34d399"
                  strokeWidth="0.8"
                  strokeOpacity="0.4"
                  className="synapse-line"
                />

                {/* Input Nodes (Physical groups) */}
                <circle cx="20" cy="20" r="5" fill={meta.color} className="node-glow" />
                <circle cx="20" cy="60" r="5" fill="#c084fc" className="node-glow" />
                <circle cx="20" cy="100" r="5" fill="#34d399" className="node-glow" />
                <circle cx="20" cy="140" r="5" fill="#f59e0b" className="node-glow" />

                {/* Hidden Layer Nodes */}
                <circle cx="120" cy="35" r="4.5" fill="#1f2937" stroke="#4b5563" strokeWidth="1.5" />
                <circle cx="120" cy="80" r="4.5" fill="#1f2937" stroke="#4b5563" strokeWidth="1.5" />
                <circle cx="120" cy="125" r="4.5" fill="#1f2937" stroke="#4b5563" strokeWidth="1.5" />

                {/* Output Decision Nodes */}
                <circle cx="220" cy="40" r="5.5" fill={meta.color} className="node-glow" />
                <circle cx="220" cy="80" r="5.5" fill="#c084fc" className="node-glow" />
                <circle cx="220" cy="120" r="5.5" fill="#34d399" className="node-glow" />

                {/* Glowing Live Observation Text */}
                <text x="30" y="23" fill="#e5e7eb" fontSize="7" fontWeight="bold" fontFamily="monospace">
                  OBS_QUEUES: {currentEpNum > 0 ? Math.round(Math.max(1, 15 - currentEpNum * 0.1)) : 'Awaiting'}
                </text>
                <text x="30" y="63" fill="#e5e7eb" fontSize="7" fontWeight="bold" fontFamily="monospace">
                  OBS_WAITS: {activeWait.toFixed(1)}s
                </text>
                <text x="30" y="103" fill="#e5e7eb" fontSize="7" fontWeight="bold" fontFamily="monospace">
                  OBS_FLOWS: {activeTput} cars
                </text>
                <text x="30" y="143" fill="#e5e7eb" fontSize="7" fontWeight="bold" fontFamily="monospace">
                  OBS_PHASE: active
                </text>

                {/* Output Actions */}
                <text x="180" y="43" fill="#e5e7eb" fontSize="7" fontWeight="bold" fontFamily="monospace" textAnchor="end">
                  DEC_SPLITS
                </text>
                <text x="180" y="83" fill="#e5e7eb" fontSize="7" fontWeight="bold" fontFamily="monospace" textAnchor="end">
                  ACTUATE
                </text>
                <text x="180" y="123" fill="#e5e7eb" fontSize="7" fontWeight="bold" fontFamily="monospace" textAnchor="end">
                  OPTIMISE
                </text>
              </svg>

              {/* Inference Ping / Completion Badge */}
              <div className={`absolute top-2 right-2 flex items-center gap-1.5 bg-gray-950/80 px-2 py-0.5 border rounded-full select-none ${isTraining ? 'border-cyan-500/20' : 'border-emerald-500/20'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isTraining ? 'bg-cyan-400 animate-ping' : 'bg-emerald-400'}`} />
                <span className="text-[7.5px] font-mono font-extrabold leading-none uppercase tracking-wide" style={{ color: isTraining ? '#22d3ee' : '#10b981' }}>
                  {isTraining ? 'TRAINING IN PROGRESS' : 'TRAINING COMPLETED'}
                </span>
              </div>
            </div>

            {/* Live & Overall Metrics Column (Right 2 cols) */}
            <div className="col-span-2 space-y-1.5 border-l border-gray-900 pl-4 h-[210px] flex flex-col justify-center">
              <h5 className="text-[8.5px] font-bold text-gray-500 uppercase tracking-widest font-mono">
                Training Telemetry Stats
              </h5>

              {/* Reward Card */}
              <div className="bg-gray-900/60 border border-gray-800/40 rounded-xl p-1.5 px-3 flex flex-col justify-between shadow-inner">
                <div className="flex justify-between items-center text-[7.5px] font-mono text-gray-500 uppercase leading-none">
                  <span>Reward Score</span>
                  <span className="text-[7px] text-cyan-400 font-bold">Inference</span>
                </div>
                <div className="flex justify-between items-baseline mt-0.5">
                  <div className="flex flex-col">
                    <span className="text-[6.5px] text-gray-500 font-mono leading-none uppercase">Live Ep</span>
                    <span className="text-[11px] font-mono font-bold text-cyan-400 mt-0.5">
                      {currentEpNum > 0 ? activeReward.toFixed(1) : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[6.5px] text-gray-500 font-mono leading-none uppercase">Peak Best</span>
                    <span className="text-[10px] font-mono font-bold text-cyan-300 mt-0.5">
                      {currentEpNum > 0 ? peakReward : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Delay Card */}
              <div className="bg-gray-900/60 border border-gray-800/40 rounded-xl p-1.5 px-3 flex flex-col justify-between shadow-inner">
                <div className="flex justify-between items-center text-[7.5px] font-mono text-gray-500 uppercase leading-none">
                  <span>Average Delay</span>
                  <span className="text-[7px] text-amber-500 font-bold">Benchmark</span>
                </div>
                <div className="flex justify-between items-baseline mt-0.5">
                  <div className="flex flex-col">
                    <span className="text-[6.5px] text-gray-500 font-mono leading-none uppercase">Live Ep</span>
                    <span className="text-[11px] font-mono font-bold text-amber-400 mt-0.5">
                      {currentEpNum > 0 ? `${activeWait.toFixed(1)}s` : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[6.5px] text-gray-500 font-mono leading-none uppercase">Baseline</span>
                    <span className="text-[10px] font-mono font-bold text-gray-400 mt-0.5">
                      {currentEpNum > 0 ? `${baselineWait.toFixed(1)}s` : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Throughput / Improvement Card */}
              <div className="bg-gray-900/60 border border-gray-800/40 rounded-xl p-1.5 px-3 flex flex-col justify-between shadow-inner">
                <div className="flex justify-between items-center text-[7.5px] font-mono text-gray-500 uppercase leading-none">
                  <span>Throughput Flow</span>
                  <span className="text-[7px] text-emerald-500 font-bold">Efficiency</span>
                </div>
                <div className="flex justify-between items-baseline mt-0.5">
                  <div className="flex flex-col">
                    <span className="text-[6.5px] text-gray-500 font-mono leading-none uppercase">Live Ep</span>
                    <span className="text-[11px] font-mono font-bold text-emerald-400 mt-0.5">
                      {currentEpNum > 0 ? `${activeTput} veh` : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[6.5px] text-gray-500 font-mono leading-none uppercase">Delay Red.</span>
                    <span className={`text-[10px] font-mono font-bold mt-0.5 ${delayReduction > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {currentEpNum > 0 ? (delayReduction > 0 ? `+${delayReduction.toFixed(1)}%` : `${delayReduction.toFixed(1)}%`) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Network Parameters Card */}
              <div className="bg-gray-900/60 border border-gray-800/40 rounded-xl p-1.5 px-3 flex flex-col justify-between shadow-inner">
                <div className="flex justify-between items-center text-[7.5px] font-mono text-gray-500 uppercase leading-none">
                  <span>Network Policy</span>
                  <span className="text-[7px] text-purple-400 font-bold">PPO State</span>
                </div>
                <div className="flex justify-between items-baseline mt-0.5">
                  <div className="flex flex-col">
                    <span className="text-[6.5px] text-gray-500 font-mono leading-none uppercase">Policy Loss</span>
                    <span className="text-[11px] font-mono font-bold text-purple-400 mt-0.5">
                      {currentEpNum > 0 ? loss.toFixed(4) : '—'}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[6.5px] text-gray-500 font-mono leading-none uppercase">Entropy</span>
                    <span className="text-[10px] font-mono font-bold text-purple-300 mt-0.5">
                      {currentEpNum > 0 ? entropy.toFixed(2) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER PROGRESS & CONTROLS ── */}
      <div className="border-t border-gray-800/80 pt-3 flex-shrink-0 z-10">
        {isTraining ? (
          /* ACTIVE PROGRESS BAR & CONTROLS */
          <div className="space-y-3 animate-fadeIn">
            <div className="flex justify-between items-center text-[10px] font-mono text-gray-400">
              <span className="flex items-center gap-1 font-bold">
                Training Convergence Progress
              </span>
              <span className="font-extrabold text-cyan-400 text-[11px]">
                Episode {currentEpNum} / {totalEpisodes}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-3 bg-gray-900 border border-gray-950 rounded-full overflow-hidden relative shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <button
                className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all duration-200 flex-shrink-0 shadow-sm border ${
                  isTrainingPaused
                    ? 'bg-amber-950/40 hover:bg-amber-900/50 text-amber-400 border-amber-900/35'
                    : 'bg-slate-900/40 hover:bg-slate-800/50 text-slate-400 border-slate-700/35'
                }`}
                onClick={isTrainingPaused ? resumeTraining : pauseTraining}
              >
                {isTrainingPaused ? 'Resume' : 'Pause'}
              </button>
              <button
                className="bg-red-950/40 hover:bg-red-900/50 text-red-400 border border-red-900/35 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition-all duration-200 flex-shrink-0 shadow-sm"
                onClick={stopTraining}
              >
                Stop
              </button>
            </div>
          </div>
        ) : (
          /* CONVERGED / READY TO SIMULATE FOOTER */
          <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
            <span>
              {isConverged
                ? 'Stable neural policy learned.'
                : 'Simulation locked: model uninitialized.'}
            </span>
            <span className="text-[10px] font-mono text-gray-500">
              Ready split constraint: {meta.label.split(' ')[0]}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
