import React, { useEffect, useState } from 'react'
import HelpPopover from './HelpPopover'
import { useSessionStore } from '../store/sessionStore'
import { useConfigStore } from '../store/configStore'
import { useSimulationStore } from '../store/simulationStore'

export default function RLBrainVisualizer() {
  const isTraining = useSessionStore((s) => s.isTraining)
  const currentMetrics = useSessionStore((s) => s.currentMetrics)
  const simConfig = useConfigStore((s) => s.simConfig)
  const currentFrame = useSimulationStore((s) => s.currentFrame)
  const isRunning = useSimulationStore((s) => s.isRunning)

  const [pulseSpeed, setPulseSpeed] = useState('3s')

  // Synaptic weight pulsing animation pace
  useEffect(() => {
    if (isTraining) {
      setPulseSpeed('1.2s')
    } else if (isRunning) {
      setPulseSpeed('2.2s')
    } else {
      setPulseSpeed('5s')
    }
  }, [isTraining, isRunning])

  // Reward parameters from store / defaults
  const wtQueue = simConfig.reward_wt_queue ?? 1.0
  const wtWait = simConfig.reward_wt_wait ?? 0.5
  const wtTp = simConfig.reward_wt_throughput ?? 2.0
  const wtCol = simConfig.reward_wt_collision ?? 1.5

  // Extract live variables or mock them if idle
  const vehicles = currentFrame?.vehicles ?? []
  
  // 1. Queues per approach
  const nQueue = vehicles.filter((v) => v.arm === 'N' && v.speed < 1.5).length
  const sQueue = vehicles.filter((v) => v.arm === 'S' && v.speed < 1.5).length
  const eQueue = vehicles.filter((v) => v.arm === 'E' && v.speed < 1.5).length
  const wQueue = vehicles.filter((v) => v.arm === 'W' && v.speed < 1.5).length
  
  const nsQueueTotal = nQueue + sQueue
  const ewQueueTotal = eQueue + wQueue
  const totalQueue = nsQueueTotal + ewQueueTotal

  // 2. Delay per axis
  const nsDelay = vehicles
    .filter((v) => (v.arm === 'N' || v.arm === 'S') && v.speed < 1.5)
    .reduce((acc, v) => acc + (v.wait_time ?? 0), 0)
  const ewDelay = vehicles
    .filter((v) => (v.arm === 'E' || v.arm === 'W') && v.speed < 1.5)
    .reduce((acc, v) => acc + (v.wait_time ?? 0), 0)
  const totalDelay = nsDelay + ewDelay

  // 3. Active clearance & signals
  const activeSignal = currentFrame?.signals?.[0]
  const currentPhase = activeSignal?.phase ?? 0
  const duration = activeSignal?.duration_s ?? 28.0

  // Calculate live normalized reward terms (for high visual responsiveness)
  const queueVal = isRunning ? Math.min(totalQueue * 0.4 * wtQueue, 10.0) : Math.min(wtQueue * 2.4, 10.0)
  const waitVal = isRunning ? Math.min((totalDelay / 12.0) * wtWait, 10.0) : Math.min(1.2 * wtWait, 10.0)
  const tpVal = isRunning 
    ? Math.min(vehicles.filter((v) => v.speed >= 8.0).length * 0.6 * wtTp, 12.0) 
    : Math.min((currentMetrics?.throughput_vph ?? 480) / 200.0 * wtTp, 12.0)
  const colVal = (currentMetrics?.collision_count ?? 0) * wtCol * 10.0
  const netReward = -(queueVal + waitVal + colVal) + tpVal

  return (
    <div className="bg-gray-950 rounded-xl border border-gray-700 p-4 mt-3 space-y-4 shadow-xl select-none hover:border-gray-600 transition-all duration-300">
      
      {/* Visual Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-lg">🧬</span>
          <div>
            <h4 className="text-xs font-bold text-gray-200 font-mono flex items-center gap-1">
              RL AGENT LIVE NEURAL NETWORK
              <HelpPopover text="### RL Agent Live Neural Network\nMaps physical intersection sensor observations to signal timing actuation outputs:\n- **Input Layer (OBS)**: Standard traffic density variables (queues, waiting times, current phase state).\n- **Hidden Layers (MLP)**: Non-linear synaptic path transformations mapping state combinations to actions.\n- **Output Layer (ACTION)**: Active decision outputs (e.g. signal cycle duration splits and early termination switches)." position="top" />
            </h4>
            <p className="text-[10px] text-gray-500 leading-none">Pulsating input nodes map physical sensors directly to actions</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[9px] px-2 py-0.5 rounded-full bg-cyan-950/30 text-cyan-400 border border-cyan-800/30">
          <span>SIZE: {simConfig.hidden_layer_size ?? 64}x{simConfig.hidden_layer_size ?? 64} MLP</span>
        </div>
      </div>
 
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-center">
        
        {/* SVG Brain Schematic (Left 3 cols) */}
        <div className="lg:col-span-3 relative h-40 bg-gray-900/40 rounded-lg overflow-hidden flex items-center justify-center border border-gray-900">
          
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
            <line x1="20" y1="20" x2="120" y2="35" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.4" className="synapse-line" />
            <line x1="20" y1="60" x2="120" y2="80" stroke="#c084fc" strokeWidth="0.8" strokeOpacity="0.4" className="synapse-line" />
            <line x1="20" y1="100" x2="120" y2="125" stroke="#34d399" strokeWidth="0.8" strokeOpacity="0.4" className="synapse-line" />
            <line x1="20" y1="140" x2="120" y2="80" stroke="#f59e0b" strokeWidth="0.8" strokeOpacity="0.4" className="synapse-line" />

            {/* Hidden Nodes to Output Nodes */}
            <line x1="120" y1="35" x2="220" y2="40" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.4" className="synapse-line" />
            <line x1="120" y1="80" x2="220" y2="80" stroke="#c084fc" strokeWidth="0.8" strokeOpacity="0.4" className="synapse-line" />
            <line x1="120" y1="125" x2="220" y2="120" stroke="#34d399" strokeWidth="0.8" strokeOpacity="0.4" className="synapse-line" />

            {/* Input Nodes (Physical groups) */}
            <circle cx="20" cy="20" r="6" fill="#22d3ee" className="node-glow text-cyan-400" />
            <circle cx="20" cy="60" r="6" fill="#c084fc" className="node-glow text-purple-400" />
            <circle cx="20" cy="100" r="6" fill="#34d399" className="node-glow text-emerald-400" />
            <circle cx="20" cy="140" r="6" fill="#f59e0b" className="node-glow text-amber-500" />

            {/* Hidden Layer Nodes */}
            <circle cx="120" cy="35" r="5" fill="#1f2937" stroke="#4b5563" strokeWidth="1.5" />
            <circle cx="120" cy="80" r="5" fill="#1f2937" stroke="#4b5563" strokeWidth="1.5" />
            <circle cx="120" cy="125" r="5" fill="#1f2937" stroke="#4b5563" strokeWidth="1.5" />

            {/* Output Decision Nodes */}
            <circle cx="220" cy="40" r="7" fill="#22d3ee" className="node-glow text-cyan-400" />
            <circle cx="220" cy="80" r="7" fill="#c084fc" className="node-glow text-purple-400" />
            <circle cx="220" cy="120" r="7" fill="#34d399" className="node-glow text-emerald-400" />

            {/* Glowing Live Observation Text */}
            <text x="32" y="23" fill="#e5e7eb" fontSize="7.5" fontWeight="bold" fontFamily="monospace">OBS_QUEUES: {totalQueue} stopped</text>
            <text x="32" y="63" fill="#e5e7eb" fontSize="7.5" fontWeight="bold" fontFamily="monospace">OBS_WAITS: {totalDelay.toFixed(1)}s</text>
            <text x="32" y="103" fill="#e5e7eb" fontSize="7.5" fontWeight="bold" fontFamily="monospace">OBS_FLOWS: {vehicles.length} cars</text>
            <text x="32" y="143" fill="#e5e7eb" fontSize="7.5" fontWeight="bold" fontFamily="monospace">OBS_PHASE: Phase {currentPhase}</text>

            {/* Output Actions */}
            <text x="175" y="43" fill="#e5e7eb" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="end">PHASE_SEL: P{currentPhase}</text>
            <text x="175" y="83" fill="#e5e7eb" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="end">GREEN_DUR: {duration.toFixed(0)}s</text>
            <text x="175" y="123" fill="#e5e7eb" fontSize="7.5" fontWeight="bold" fontFamily="monospace" textAnchor="end">ACTION: {duration > 28.0 ? 'EXTEND' : 'CLEAR'}</text>
          </svg>

          {/* Active Synapse HUD */}
          {isRunning && (
            <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-gray-950/80 px-2 py-0.5 border border-cyan-500/20 rounded-full select-none">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-[8px] font-mono text-cyan-400 font-extrabold leading-none uppercase tracking-wide">INFERENCE ACTIVE</span>
            </div>
          )}
        </div>

        {/* Live Reward Components breakdown (Right 2 cols) */}
        <div className="lg:col-span-2 space-y-2 border-t lg:border-t-0 lg:border-l border-gray-900 pt-3 lg:pt-0 lg:pl-3">
          <SectionTitleSmall>
            <span className="flex items-center gap-1">
              Reward breakdown
              <HelpPopover text="### Reward Breakdown\nVisualizes the real-time scoring formula of individual actions:\n- **Queue Penalty**: Penalizes vehicle backlogs.\n- **Wait Penalty**: Penalizes commuter stop delay seconds.\n- **Throughput Bonus**: Rewards vehicle volume clearance.\n- **Safety Penalty**: Applies extreme penalties for conflict risks." position="top" />
            </span>
          </SectionTitleSmall>
          
          <div className="space-y-1.5">
            {/* Queue Penalty */}
            <RewardBar 
              label="Queue Penalty" 
              val={`-${queueVal.toFixed(1)}`} 
              pct={Math.min((queueVal / 10) * 100, 100)} 
              color="bg-red-500/80" 
            />

            {/* Wait Penalty */}
            <RewardBar 
              label="Wait Penalty" 
              val={`-${waitVal.toFixed(1)}`} 
              pct={Math.min((waitVal / 10) * 100, 100)} 
              color="bg-amber-500/80" 
            />

            {/* Throughput Bonus */}
            <RewardBar 
              label="Throughput Bonus" 
              val={`+${tpVal.toFixed(1)}`} 
              pct={Math.min((tpVal / 12) * 100, 100)} 
              color="bg-emerald-500/80" 
              isPositive 
            />

            {/* Safety Penalty */}
            <RewardBar 
              label="Safety Penalty" 
              val={`-${colVal.toFixed(1)}`} 
              pct={Math.min((colVal / 10) * 100, 100)} 
              color="bg-red-700" 
            />
          </div>

          {/* Aggregate Live Step Reward */}
          <div className="bg-gray-900/60 rounded p-1.5 flex justify-between items-center mt-2 border border-gray-800">
            <span className="text-[9px] font-mono text-gray-500 uppercase">Net step reward</span>
            <span className={`text-xs font-mono font-bold ${netReward >= 0 ? 'text-emerald-400' : 'text-cyan-400'}`}>
              {netReward >= 0 ? '+' : ''}{netReward.toFixed(1)}
            </span>
          </div>
        </div>

      </div>

    </div>
  )
}

function SectionTitleSmall({ children }: { children: React.ReactNode }) {
  return (
    <h5 className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1 leading-none">
      {children}
    </h5>
  )
}

function RewardBar({ 
  label, val, pct, color, isPositive = false 
}: { 
  label: string; val: string; pct: number; color: string; isPositive?: boolean 
}) {
  return (
    <div>
      <div className="flex justify-between text-[9px] font-mono text-gray-400 mb-0.5 leading-none">
        <span className="truncate max-w-[70px]">{label}</span>
        <span className={isPositive ? 'text-emerald-400' : 'text-red-400'}>{val}</span>
      </div>
      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
