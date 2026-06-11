import { useState } from 'react'
import { TrainingModeSelector, type TrainingMode } from './TrainingModeSelector'
import { useSessionStore } from '../store/sessionStore'
import { useSimulationStore } from '../store/simulationStore'
import { useConfigStore } from '../store/configStore'
import { useDecisionStore } from '../store/decisionStore'
import { useSimulation } from '../hooks/useSimulation'
import TrainingChart from './TrainingChart'
import InsightCards from './InsightCards'
import ConvergenceIndicator from './ConvergenceIndicator'
import { TrainingIntelligenceModal } from './TrainingIntelligenceModal'

const MODEL_COLORS: Record<string, string> = {
  rl1: '#22d3ee', rl2: '#c084fc', rl3: '#34d399', rl4: '#f87171', custom: '#a78bfa',
}
const MODEL_ALGO: Record<string, string> = {
  rl1: 'PPO', rl2: 'DQN', rl3: 'SAC', rl4: 'A2C', custom: 'Custom',
}

function SecLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <span className="w-0.5 h-2.5 rounded-full bg-[#8fb8ce]/50 flex-shrink-0" />
      <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-slate-500 font-mono">{children}</span>
    </div>
  )
}

function MetricPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col items-center bg-black/25 border border-white/[0.05] rounded-xl py-2 px-3 min-w-0">
      <span className="text-[16px] font-bold font-mono tabular-nums leading-none" style={{ color: color ?? '#f1f5f9' }}>
        {value}
      </span>
      <span className="text-[7px] font-mono uppercase tracking-widest text-slate-600 mt-1 leading-none">{label}</span>
    </div>
  )
}

export default function RLNeuralPanel({ modelKey }: { modelKey: string }) {
  const [showIntel, setShowIntel] = useState(false)
  const trainingMode   = useSessionStore(s => s.trainingMode)
  const setTrainingMode = useSessionStore(s => s.setTrainingMode)
  const { startTraining } = useSimulation()
  const isTraining     = useSessionStore(s => s.isTraining)
  const trainingModelKey = useSessionStore(s => s.trainingModelKey)
  const trainingStage  = useSessionStore(s => s.trainingStage)
  const isConverged    = useSessionStore(s => s.isConverged)
  const episodes       = useSessionStore(s => s.episodes)
  const currentMetrics = useSessionStore(s => s.currentMetrics)
  const insights       = useSessionStore(s => s.insights)
  const { simConfig }  = useConfigStore()
  const trainedModels  = useSimulationStore(s => s.trainedModels)
  const { liveEpisodeHistory } = useDecisionStore()

  const color    = MODEL_COLORS[modelKey] ?? '#8fb8ce'
  const algo     = MODEL_ALGO[modelKey]  ?? 'RL'
  const isTrained = trainedModels.includes(modelKey)
  // Training UI is scoped to the model actually being trained — other tabs stay
  // idle even though training runs in the background for a different model.
  const isThisTraining = isTraining && trainingModelKey === modelKey

  const latestEp   = episodes[episodes.length - 1]
  const epCount    = episodes.length
  const lastReward = latestEp?.reward    ?? 0
  const lastWait   = latestEp?.metrics?.mean_wait ?? currentMetrics?.avg_wait_s ?? 0
  const lastTput   = latestEp?.metrics?.throughput ?? currentMetrics?.throughput_vph ?? 0

  // Convergence progress (episodes toward total_timesteps equivalent)
  const totalSteps = Number(simConfig.total_timesteps ?? 500000)
  
  let totalEpisodes = 500;
  if (trainingMode === 'stage1' || trainingMode === 'stage2') {
    totalEpisodes = Math.round(totalSteps / 40);
  } else if (trainingMode === 'stage3') {
    totalEpisodes = Math.round(totalSteps / 360);
  } else if (trainingMode === 'stage4') {
    totalEpisodes = Math.round((totalSteps * 0.6) / 40 + (totalSteps * 0.4) / 360);
  }

  const isFinished = isTrained && !isThisTraining;
  const progressRatio = isFinished ? 1 : Math.min(1, epCount / Math.max(1, totalEpisodes));
  const progressPercent = progressRatio * 100;
  const denominatorText = isFinished ? `${epCount}` : `~${totalEpisodes}`;

  return (
    <div className="w-[560px] h-[560px] bg-gradient-to-b from-[#0e131c] to-[#0a0e15] border border-white/[0.07] rounded-2xl flex flex-col overflow-hidden select-none">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-[#0d1220] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0"
            style={{ borderColor: `${color}30`, backgroundColor: `${color}10` }}>
            <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" style={{ color }}>
              <circle cx="8" cy="8" r="2" fill="currentColor"/>
              <circle cx="2" cy="3" r="1.5" fill="currentColor" opacity="0.5"/>
              <circle cx="14" cy="3" r="1.5" fill="currentColor" opacity="0.5"/>
              <circle cx="2" cy="13" r="1.5" fill="currentColor" opacity="0.5"/>
              <circle cx="14" cy="13" r="1.5" fill="currentColor" opacity="0.5"/>
              <line x1="8" y1="6" x2="2" y2="4.5"  stroke="currentColor" strokeWidth="1" opacity="0.4"/>
              <line x1="8" y1="6" x2="14" y2="4.5" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
              <line x1="8" y1="10" x2="2" y2="11.5"  stroke="currentColor" strokeWidth="1" opacity="0.4"/>
              <line x1="8" y1="10" x2="14" y2="11.5" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
            </svg>
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-slate-100 leading-none">Neural Processing</h3>
            <p className="text-[9px] font-mono mt-0.5" style={{ color: `${color}80` }}>
              {algo} · {isThisTraining ? 'Training active' : isTrained ? 'Trained' : 'Not started'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Single convergence indicator — no duplicate status badge */}
          <ConvergenceIndicator />
          {/* Full Intel — shown when there's episode data and training is done */}
          {isTrained && !isThisTraining && liveEpisodeHistory.length > 0 && (
            <button
              onClick={() => {
                useSimulationStore.getState().resetIntelUIState()
                setShowIntel(true)
              }}
              className="flex items-center gap-1.5 text-[8px] font-mono uppercase tracking-widest px-2 py-1 rounded-md border border-cyan-500/40 text-cyan-400 bg-cyan-500/[0.06] hover:bg-cyan-500/20 transition-colors"
              title="Open Training Intelligence Report"
            >
              🧠 Full Intel
            </button>
          )}
          {/* Redo — retrain from scratch, shown only when trained and not currently training */}
          {isTrained && !isTraining && (
            <button
              onClick={() => {
                useDecisionStore.getState().clearLive()
                startTraining(simConfig.total_timesteps, trainingMode)
              }}
              className="flex items-center gap-1.5 text-[8px] font-mono uppercase tracking-widest px-2 py-1 rounded-md border border-orange-500/40 text-orange-400 bg-orange-500/[0.06] hover:bg-orange-500/20 transition-colors"
              title="Retrain from scratch"
            >
              ↺ Redo
            </button>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">

        {/* Training mode selector — only before first training */}
        {!isTraining && !isTrained && (
          <div>
            <TrainingModeSelector selected={trainingMode} onChange={setTrainingMode} />
          </div>
        )}

        {/* Active stage badge — during training */}
        {isThisTraining && trainingStage > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[9px] text-gray-400 font-mono uppercase tracking-widest">Active</span>
            <span className="text-[10px] font-bold text-cyan-300">Stage {trainingStage}</span>
            <span className="text-[9px] text-gray-600 font-mono">
              {trainingStage === 1 ? '— Fast Mock'
               : trainingStage === 2 ? '— Enriched Mock'
               : trainingStage === 3 ? '— SUMO Physics'
               : '— Curriculum'}
            </span>
          </div>
        )}

        {/* Episode KPIs */}
        <div>
          <SecLabel>Episode Metrics</SecLabel>
          <div className="grid grid-cols-4 gap-2">
            <MetricPill label="Episodes"  value={epCount.toLocaleString()} color={color} />
            <MetricPill label="Reward"    value={lastReward > 0 ? lastReward.toFixed(1) : '—'} color={lastReward > 0 ? '#4ade80' : '#475569'} />
            <MetricPill label="Avg Wait"  value={lastWait  > 0 ? `${lastWait.toFixed(0)}s` : '—'} color={lastWait > 60 ? '#f87171' : lastWait > 0 ? '#facc15' : '#475569'} />
            <MetricPill label="Tput/hr"   value={lastTput  > 0 ? Math.round(lastTput).toLocaleString() : '—'} color={lastTput > 0 ? '#97b9a7' : '#475569'} />
          </div>
        </div>

        {/* Training convergence chart */}
        <div className="bg-black/20 border border-white/[0.05] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <SecLabel>Training Convergence</SecLabel>
            {epCount > 0 && (
              <span className="text-[8px] font-mono text-slate-600 tabular-nums">
                {epCount} ep · est {progressPercent.toFixed(0)}% complete
              </span>
            )}
          </div>
          {isThisTraining || epCount > 0 ? (
            <TrainingChart />
          ) : (
            <div className="h-24 flex items-center justify-center">
              <p className="text-[9px] font-mono uppercase tracking-widest text-slate-700">
                Start training to see convergence curve
              </p>
            </div>
          )}
        </div>

        {/* Progress bar toward convergence */}
        {(isThisTraining || isTrained) && (
          <div className="bg-black/20 border border-white/[0.05] rounded-xl px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <SecLabel>Training Progress</SecLabel>
              <span className="text-[9px] font-mono tabular-nums" style={{ color }}>
                {epCount} / {denominatorText} episodes
              </span>
            </div>
            <div className="w-full h-2 bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, progressPercent)}%`, backgroundColor: color, opacity: 0.8 }}
              />
            </div>
          </div>
        )}

        {/* Hyperparameter summary */}
        <div className="bg-black/20 border border-white/[0.05] rounded-xl px-3 py-2.5">
          <SecLabel>Network Config</SecLabel>
          <div className="grid grid-cols-3 gap-2 text-[9px] font-mono">
            {[
              { k: 'Algorithm',   v: algo },
              { k: 'LR',          v: simConfig.learning_rate?.toExponential(0) ?? '3e-4' },
              { k: 'Gamma',       v: (simConfig.discount_factor ?? 0.99).toString() },
              { k: 'Hidden',      v: `${simConfig.hidden_layer_size ?? 64}` },
              { k: 'Timesteps',   v: ((simConfig.total_timesteps ?? 500000) / 1000).toFixed(0) + 'k' },
              { k: 'Optimizer',   v: modelKey === 'rl4' ? 'RMSProp' : 'Adam' },
            ].map(({ k, v }) => (
              <div key={k} className="flex flex-col gap-0.5 bg-black/20 rounded-lg p-1.5 border border-white/[0.04]">
                <span className="text-[7px] uppercase tracking-widest text-slate-600">{k}</span>
                <span className="text-slate-200 font-semibold tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Strategy milestones */}
        <div className="bg-black/20 border border-white/[0.05] rounded-xl px-3 py-2.5">
          <SecLabel>Strategy Milestones</SecLabel>
          {insights.length > 0 ? (
            <InsightCards />
          ) : (
            <p className="text-[9px] font-mono text-slate-700 text-center py-2 uppercase tracking-widest">
              {isThisTraining ? 'Learning in progress...' : 'No milestones yet'}
            </p>
          )}
        </div>

      </div>

      {/* Training Intelligence Modal */}
      {showIntel && <TrainingIntelligenceModal onClose={() => setShowIntel(false)} />}
    </div>
  )
}
