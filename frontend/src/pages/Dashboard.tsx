import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import HelpPopover from '../components/HelpPopover'
import { useSocket } from '../hooks/useSocket'
import { useSimulation } from '../hooks/useSimulation'
import { useSimulationStore } from '../store/simulationStore'
import { useSessionStore } from '../store/sessionStore'
import { useConfigStore } from '../store/configStore'
import SimCanvas from '../components/SimCanvas'
import { XaiLiveCanvas } from '../components/XaiLiveCanvas'
import { TrainingModeSelector, type TrainingMode } from '../components/TrainingModeSelector'
import SplitCanvas from '../components/SplitCanvas'
import RLConfigDetailsPanel from '../components/RLConfigDetailsPanel'
import RLTrainingHUD from '../components/RLTrainingHUD'
import KpiCards from '../components/KpiCards'
import EconomicProjector from '../components/EconomicProjector'
import TrainingChart from '../components/TrainingChart'
import TrainingExplainer from '../components/TrainingExplainer'
import InsightCards from '../components/InsightCards'
import ConvergenceIndicator from '../components/ConvergenceIndicator'
import XaiPanel from '../components/XaiPanel'
import SimConfigPanel from '../components/SimConfigPanel'
import ConfigModal from '../components/ConfigModal'
import SimStatsPanel from '../components/SimStatsPanel'
import BeforeAfterChart from '../components/BeforeAfterChart'
import QueueHeatmap from '../components/QueueHeatmap'
import PhaseTimeline from '../components/PhaseTimeline'
import QuickDemoButton from '../components/QuickDemoButton'
import SimLiveStatsPanel from '../components/SimLiveStatsPanel'
import RLNeuralPanel from '../components/RLNeuralPanel'
import { XaiDecisionSidebar } from '../components/XaiDecisionSidebar'

type Panel = 'stats' | 'xai' | 'config'

const PANEL_BTN_ICONS: Record<string, string> = {
  Stats: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h10v-2H7v2zm0 4h10v-2H7v2zM7 7v2h10V7H7z',
  XAI: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
  Config: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.484.484 0 0 0 14 2h-3.84c-.24 0-.43.17-.47.39l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L3.32 9.13a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.07.63-.07.94s.02.64.07.94l-2.03 1.58a.47.47 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
}

function PanelBtn({ active, label, onClick, disabled }: { active: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  const path = PANEL_BTN_ICONS[label] ?? ''
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-semibold uppercase tracking-widest transition-all duration-200 ${disabled
          ? 'bg-transparent border-white/[0.04] text-slate-650 opacity-40 cursor-not-allowed'
          : active
            ? 'bg-[#8fb8ce]/[0.12] border-[#8fb8ce]/35 text-[#8fb8ce]'
            : 'bg-transparent border-white/[0.07] text-slate-500 hover:border-white/[0.14] hover:text-slate-300'
        }`}
    >
      {path && (
        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 flex-shrink-0 opacity-70" fill="currentColor">
          <path d={path} />
        </svg>
      )}
      {label}
      {active && !disabled && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full bg-[#8fb8ce]/60" />}
    </button>
  )
}



export default function Dashboard() {
  useSocket()

  const [rightColumnTab, setRightColumnTab] = useState<'config' | 'stats' | 'neural'>('config')
  const [baselineRightTab, setBaselineRightTab] = useState<'config' | 'stats'>('config')
  const [trainingMode, setTrainingMode] = useState<TrainingMode>('stage1')
  const [activePanel, setActivePanel] = useState<Panel | null>(null)
  const configModalOpen = useSimulationStore((s) => s.configModalOpen)
  const setConfigModalOpen = useSimulationStore((s) => s.setConfigModalOpen)
  const configModalMode = useSimulationStore((s) => s.configModalMode)
  const setConfigModalMode = useSimulationStore((s) => s.setConfigModalMode)
  const [simDurationMin, setSimDurationMin] = useState<15 | 30 | 45 | 60>(60)
  const [isAnalyticsCollapsed, setIsAnalyticsCollapsed] = useState(true)
  const [isLearningCollapsed, setIsLearningCollapsed] = useState(true)
  const [isTrainingCollapsed, setIsTrainingCollapsed] = useState(true)
  const [isEconomicCollapsed, setIsEconomicCollapsed] = useState(true)



  const {
    startSimulation, stopSimulation,
    pauseSimulation, resumeSimulation,
    setSpeed,
    startTraining, stopTraining,
  } = useSimulation()

  const simSpeed = useSimulationStore((s) => s.simSpeed)

  const togglePanel = (p: Panel) =>
    setActivePanel((cur) => (cur === p ? null : p))

  const getRlExplainerHelp = () => {
    if (selectedModelSingle === 'baseline') {
      return `### Webster Pre-timed Controller\nUses static timing splits calculated based on Webster's optimal cycle length formula:\n$$C_0 = \\\\frac{1.5L + 5}{1 - Y}$$\nWhere:\n- $L$ is the total physical loss time per cycle (yellow + red clearance)\n- $Y$ is the sum of critical lane flow ratios across arms\n- The baseline runs deterministically and does not learn.`
    }
    if (selectedModelSingle === 'rl1' || selectedModelSingle === 'custom') {
      return `### PPO (Proximal Policy Optimization)\nAn on-policy policy gradient optimizer. Constraints policy updates via a clipping objective to avoid high deviations:\n$$L^{CLIP}(\\\\theta) = \\\\hat{\\\\mathbb{E}}_t [ \\\\min(r_t(\\\\theta)\\\\hat{A}_t, \\\\text{clip}(r_t(\\\\theta), 1-\\\\epsilon, 1+\\\\epsilon)\\\\hat{A}_t) ]$$\nWhere:\n- $r_t(\\\\theta)$ is the policy probability ratio\n- $\\\\hat{A}_t$ is the Generalized Advantage Estimator (GAE)\n- $\\\\epsilon$ represents the clipping radius (default $0.2$)`
    }
    if (selectedModelSingle === 'rl2') {
      return `### DQN (Deep Q-Network)\nAn off-policy value-based algorithm. Estimates state-action utility via a deep Q-network with temporal difference learning:\n$$L(\\\\theta) = \\\\mathbb{E} [ ( r + \\\\gamma \\\\max_{a'} Q(s', a'; \\\\theta^-) - Q(s, a; \\\\theta) )^2 ]$$\nWhere:\n- $Q(s, a; \\\\theta)$ represents the value network\n- $\\\\theta^-$ represents target parameters to prevent divergence\n- $\\\\gamma$ is the discount factor`
    }
    if (selectedModelSingle === 'rl3') {
      return `### SAC (Soft Actor-Critic)\nAn entropy-regularized off-policy actor-critic algorithm that optimizes both the expected long-term reward and policy exploration entropy:\n$$J(\\\\pi) = \\\\sum_{t=0}^T \\\\mathbb{E} [ r(s_t, a_t) + \\\\alpha \\\\mathcal{H}(\\\\pi(\\\\cdot|s_t)) ]$$\nWhere:\n- $\\mathcal{H}$ is the policy entropy (exploration width)\n- $\\alpha$ is the entropy temperature coefficient\n- Automatically balances exploit vs explore decisions`
    }
    if (selectedModelSingle === 'rl4') {
      return `### A2C (Advantage Actor-Critic)\nA synchronous actor-critic policy gradient algorithm that utilizes the advantage function to reduce variance:\n$$L^{policy}(\\\\theta) = -\\\\log \\\\pi_\\\\theta(a_t|s_t) \\\\hat{A}(s_t, a_t)$$\nWhere:\n- $\\hat{A}(s, a) = Q(s, a) - V(s)$ represents advantage\n- Actor represents policy network $\\pi_\\theta$\n- Critic represents value network $V_\\phi$`
    }
    return ''
  }

  const { simConfig, updateSimConfig } = useConfigStore()

  const handleUpdateSim = () => {
    const latestConfig = useConfigStore.getState().simConfig
    if (isTraining) {
      stopTraining()
      setTimeout(() => startTraining(latestConfig.total_timesteps, latestConfig.training_mode ?? 'stage1'), 150)
    } else {
      stopSimulation()
      setTimeout(() => {
        startSimulation()
        setBaselineRightTab('stats')
        setRightColumnTab('stats')
      }, 150)
    }
  }

  const handleStartTraining = () => {
    const latestConfig = useConfigStore.getState().simConfig
    startTraining(latestConfig.total_timesteps, latestConfig.training_mode ?? 'stage1')
  }

  const isRunning = useSimulationStore((s) => s.isRunning)
  const isPaused = useSimulationStore((s) => s.isPaused)
  const runtimeDevice = useSimulationStore((s) => s.runtimeDevice)
  const runtimeDeviceName = useSimulationStore((s) => s.runtimeDeviceName)
  const runtimeTorchVersion = useSimulationStore((s) => s.runtimeTorchVersion)
  const splitIsRunning = useSimulationStore((s) => s.splitIsRunning)
  const splitIsPaused = useSimulationStore((s) => s.splitIsPaused)
  const splitSimSpeed = useSimulationStore((s) => s.splitSimSpeed)
  const viewMode = useSimulationStore((s) => s.viewMode)
  const setViewMode = useSimulationStore((s) => s.setViewMode)

  const selectedModelSingle = useSimulationStore((s) => s.selectedModelSingle)
  const setSelectedModelSingle = useSimulationStore((s) => s.setSelectedModelSingle)
  const selectedModelsSplit = useSimulationStore((s) => s.selectedModelsSplit)
  const setSelectedModelsSplit = useSimulationStore((s) => s.setSelectedModelsSplit)
  const trainedModels = useSimulationStore((s) => s.trainedModels)
  const addTrainedModel = useSimulationStore((s) => s.addTrainedModel)

  const baselineFrame = useSimulationStore((s) => s.baselineFrame)
  const rl1Frame = useSimulationStore((s) => s.rl1Frame)
  const rl2Frame = useSimulationStore((s) => s.rl2Frame)
  const rl3Frame = useSimulationStore((s) => s.rl3Frame)
  const rl4Frame = useSimulationStore((s) => s.rl4Frame)
  const customFrame = useSimulationStore((s) => s.customFrame)

  const isTraining = useSessionStore((s) => s.isTraining)
  const trainingModelKey = useSessionStore((s) => s.trainingModelKey)
  // True only when the CURRENTLY VIEWED model is the one being trained. Training can
  // run in the background for one model while the user browses other tabs; those
  // other tabs must not show the training UI.
  const isActiveModelTraining = isTraining && trainingModelKey === selectedModelSingle
  const currentMetrics = useSessionStore((s) => s.currentMetrics)
  const baselineMetrics = useSessionStore((s) => s.baselineMetrics)
  const isBaselineCompleted = useSessionStore((s) => s.isBaselineCompleted)
  const simTimeS = useSimulationStore((s) => s.simTimeS)
  const splitSimTimeS = useSimulationStore((s) => s.splitSimTimeS)
  const economic = useSessionStore((s) => s.economic)

  const fmtClock = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const runtimeLabel = runtimeDevice === 'cuda'
    ? `CUDA${runtimeDeviceName ? ` · ${runtimeDeviceName}` : ''}`
    : runtimeDevice === 'cpu'
      ? 'CPU'
      : 'Runtime unknown'
  const runtimeTone = runtimeDevice === 'cuda'
    ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
    : runtimeDevice === 'cpu'
      ? 'text-slate-300 border-slate-500/30 bg-slate-500/10'
      : 'text-amber-300 border-amber-500/30 bg-amber-500/10'

  // Keep Neural Processing tab while training is active
  useEffect(() => {
    if (isTraining) {
      setRightColumnTab('neural')
    }
  }, [isTraining])

  // Fetch trained models on disk on mount
  useEffect(() => {
    const ALGO_TO_KEY: Record<string, string> = {
      PPO: 'rl1',
      DQN: 'rl2',
      SAC: 'rl3',
      A2C: 'rl4',
      Custom: 'custom',
    }
    fetch('/api/models')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          const store = useSimulationStore.getState()
          res.data.forEach((m: any) => {
            if (m.name) {
              const modelKey = ALGO_TO_KEY[m.name] || m.name
              if (['rl1', 'rl2', 'rl3', 'rl4', 'custom'].includes(modelKey)) {
                store.addTrainedModel(modelKey)
              }
            }
          })
        }
      })
      .catch((err) => console.error('Failed to load models list:', err))
  }, [])

  // (XAI tab removed — Training Intelligence is now inside the NRAL panel)

  return (
    <div className="studio-theme h-screen overflow-hidden flex flex-col" style={{ background: 'radial-gradient(1400px 700px at 70% -5%, rgba(71,85,105,0.10), transparent 55%), radial-gradient(900px 500px at -5% 40%, rgba(51,65,85,0.08), transparent 50%), #07090d' }}>

      {/* ── Header ── */}
      <header className="bg-[#0a0d14]/96 border-b border-white/[0.07] px-6 py-0 flex items-center justify-between sticky top-0 z-40 backdrop-blur-xl shadow-[0_1px_0_rgba(255,255,255,0.04),0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4 py-3">
          {/* Brand mark */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full border border-white/10 bg-white/[0.02] flex items-center justify-center">
              <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5">
                <circle cx="8" cy="8" r="7" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
                <circle cx="8" cy="4.5" r="1.2" fill="#f87171" />
                <circle cx="8" cy="8.0" r="1.2" fill="#fbbf24" />
                <circle cx="8" cy="11.5" r="1.2" fill="#34d399" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className="flex items-center" style={{ fontFamily: "'Outfit', sans-serif" }}>
                  <span className="text-[13.5px] font-semibold text-white/90 tracking-tight">Velo</span>
                  <span className="text-[13.5px] font-extrabold text-[#10b981]/85 tracking-tight">City</span>
                </div>
                <span className="text-[9px] text-[#f59e0b]/60 hidden lg:block font-mono select-none">·</span>
                <span className="text-[9.5px] text-slate-400/80 hidden lg:block font-medium tracking-wider" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Traffic Management Tool</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                <div className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${(viewMode === 'split' ? splitIsRunning : isRunning) ? 'bg-emerald-400 animate-pulse-dot' : 'bg-slate-600'}`} />
                  <p className="text-[9px] text-slate-500 font-bold tracking-wider uppercase">
                    {(viewMode === 'split' ? splitIsRunning : isRunning) ? 'SIMULATION ACTIVE' : 'READY'}
                  </p>
                </div>
                {runtimeDevice && (
                  <span
                    className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[8px] font-bold font-mono uppercase tracking-wider ${runtimeTone}`}
                    title={runtimeTorchVersion ? `PyTorch ${runtimeTorchVersion}` : undefined}
                  >
                    {runtimeLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {[
            { to: '/', label: 'Landing Page' },
            { to: '/simulations', label: 'Simulations', target: '_blank' },
            { to: '/analyzer', label: 'Analyzer', target: '_blank' },
            { to: '/report', label: 'Report', target: '_blank' },
          ].map(({ to, label, target }) => (
            <Link
              key={to}
              to={to}
              target={target}
              rel={target === '_blank' ? 'noopener noreferrer' : undefined}
              className="text-[11px] text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-md hover:bg-white/[0.04] transition-colors font-medium"
            >
              {label}
            </Link>
          ))}
          <div className="w-px h-4 bg-white/10 mx-1" />
          <QuickDemoButton />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Main scroll area ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">

          {/* Control bar */}
          <div className="flex items-center gap-2.5 flex-wrap bg-[#0d1117]/60 border border-white/[0.06] rounded-xl px-3 py-2 backdrop-blur-sm">

            {/* View toggle */}
            <div className="flex bg-[#0a0d14] rounded-lg p-0.5 gap-0.5 border border-white/[0.06]">
              {(['single', 'split'] as const).map((m) => {
                const isSplitDisabled = m === 'split' && trainedModels.length === 0
                return (
                  <button
                    key={m}
                    className={`px-3 py-1 rounded text-xs font-mono transition-all ${viewMode === m
                      ? 'bg-slate-600/30 text-slate-100'
                      : isSplitDisabled
                        ? 'text-gray-600 cursor-not-allowed opacity-40 select-none'
                        : 'text-gray-500 hover:text-gray-300'
                      }`}
                    disabled={isSplitDisabled}
                    title={isSplitDisabled ? 'Train at least one RL Agent in Single View to unlock split comparison.' : ''}
                    onClick={() => setViewMode(m)}
                  >
                    {m === 'single' ? 'Single View' : 'Split Grid'}
                  </button>
                )
              })}
            </div>

            {/* Single Model Selector */}
            {viewMode === 'single' && (
              <div className="flex items-center bg-[#0a0d14] rounded-lg p-0.5 gap-1 border border-white/[0.06]">
                <span className="text-[9px] font-mono text-slate-600 px-2 font-bold uppercase tracking-wider flex items-center">
                  Active:
                  <HelpPopover text="### RL Algorithm Presets\nSelect between deterministic baselines and diverse adaptive Reinforcement Learning agents:\n- **Baseline**: Static green splits cycles based on Webster rules.\n- **RL1 (PPO)**: On-policy gradient agent ($8-35s$ green splits).\n- **RL2 (DQN)**: Off-policy deep Q-network ($6-30s$ green splits).\n- **RL3 (SAC)**: Continuous entropy regularized actor-critic ($10-40s$ green splits).\n- **RL4 (A2C)**: Synchronous advantage micro-controller ($5-25s$ green splits)." position="top" />
                </span>
                {(['baseline', 'rl1', 'rl2', 'rl3', 'rl4'] as const).map((m) => {
                  const isActive = selectedModelSingle === m
                  const isRl = m !== 'baseline'
                  const maxDur = Number(simConfig.simulation_duration_s ?? 1800)
                  const hasCompletedBaseline = isBaselineCompleted || (simTimeS >= maxDur && maxDur > 0)
                  const isDisabled = isRl && !hasCompletedBaseline

                  const labelMap: Record<string, string> = {
                    baseline: 'Baseline',
                    rl1: 'RL1 (PPO)',
                    rl2: 'RL2 (DQN)',
                    rl3: 'RL3 (SAC)',
                    rl4: 'RL4 (A2C)',
                  }
                  return (
                    <button
                      key={m}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${isActive
                        ? 'border-slate-500 bg-slate-700/30 text-slate-100 font-bold'
                        : isDisabled
                          ? 'border-transparent text-gray-750 cursor-not-allowed opacity-30 select-none'
                          : 'border-transparent text-gray-500 hover:text-gray-300'
                        }`}
                      disabled={isDisabled}
                      title={isDisabled ? 'Execute Baseline Simulation first to establish a reference and unlock RL agents.' : ''}
                      onClick={() => {
                        if (isDisabled) return
                        // Don't stop training when switching tabs — allow background training
                        if (isRunning) {
                          stopSimulation()
                        }

                        // Save outgoing model training details!
                        if (selectedModelSingle !== 'baseline') {
                          useSessionStore.getState().saveModelDetails(selectedModelSingle)
                        }

                        // Keep simulation frames and session info when traversing tabs. Only pause running flags.
                        useSimulationStore.setState({
                          isRunning: false,
                          isPaused: false,
                        })

                        // Load incoming model training details!
                        useSessionStore.getState().loadModelDetails(m)

                        // Dynamically load previously stored / edited config values for this specific model tab!
                        useConfigStore.getState().loadTabConfig(m)

                        setSelectedModelSingle(m)
                      }}
                    >
                      {labelMap[m]}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Split Grid Selector */}
            {viewMode === 'split' && (
              <div className="flex items-center bg-[#0a0d14] rounded-lg p-0.5 gap-1 border border-white/[0.06]">
                <span className="text-[9px] font-mono text-slate-600 px-2 font-bold uppercase tracking-wider">Compare (2-3):</span>
                {(['baseline', 'rl1', 'rl2', 'rl3', 'rl4'] as const).map((m) => {
                  const isAvailable = m === 'baseline' || trainedModels.includes(m)
                  const isSelected = selectedModelsSplit.includes(m)
                  const labelMap: Record<string, string> = {
                    baseline: 'Baseline',
                    rl1: 'RL1 (PPO)',
                    rl2: 'RL2 (DQN)',
                    rl3: 'RL3 (SAC)',
                    rl4: 'RL4 (A2C)',
                  }
                  const handleToggle = () => {
                    if (!isAvailable) return
                    if (isSelected) {
                      if (selectedModelsSplit.length > 2) {
                        setSelectedModelsSplit(selectedModelsSplit.filter((item) => item !== m))
                      }
                    } else {
                      if (selectedModelsSplit.length < 3) {
                        setSelectedModelsSplit([...selectedModelsSplit, m])
                      }
                    }
                  }

                  return (
                    <button
                      key={m}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all ${isSelected
                        ? 'border-slate-500 bg-slate-700/30 text-slate-100 font-bold'
                        : isAvailable
                          ? 'border-transparent text-gray-500 hover:text-gray-300'
                          : 'border-transparent text-gray-700 cursor-not-allowed opacity-35'
                        }`}
                      onClick={handleToggle}
                      disabled={!isAvailable}
                      title={!isAvailable ? `${labelMap[m]} has not been trained yet. Train it in Single View to unlock comparison.` : ''}
                    >
                      {labelMap[m]}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Simulation controls — for RL models: only after training completes, never during training */}
            {(viewMode === 'split' || selectedModelSingle === 'baseline' || (trainedModels.includes(selectedModelSingle) && !isTraining)) && (
              !(viewMode === 'split' ? splitIsRunning : isRunning) && (
                <div className="flex items-center gap-2 animate-fadeIn">
                  <button
                    className="flex items-center gap-1.5 bg-[#0f2a1c] hover:bg-[#142e20] border border-[#4ade80]/20 hover:border-[#4ade80]/35 text-[#4ade80]/85 hover:text-[#4ade80] px-4 py-1.5 rounded-lg text-xs font-semibold transition-all tracking-wide"
                    onClick={() => {
                      setConfigModalMode('simulation')
                      setConfigModalOpen(true)
                    }}
                  >
                    <svg viewBox="0 0 24 24" className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    New Simulation
                  </button>
                </div>
              )
            )}

            {/* Training controls — only on the tab whose model is actually training */}
            {viewMode === 'single' && selectedModelSingle !== 'baseline' && isActiveModelTraining && (
              <button
                className="flex items-center gap-1.5 bg-[#0b0f17]/85 backdrop-blur-md hover:bg-red-500/10 border border-red-500/20 hover:border-red-500/35 text-red-400/90 hover:text-red-400 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all focus:outline-none shadow-[0_2px_10px_rgba(0,0,0,0.3)]"
                onClick={stopTraining}
              >
                <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current">
                  <rect x="5" y="5" width="14" height="14" rx="1.5" />
                </svg>
                Stop Training
              </button>
            )}

            {/* Consolidated split grid playback bar */}
            {viewMode === 'split' && splitIsRunning && (
              <div className="flex items-center gap-2.5 bg-[#0b0f17]/85 backdrop-blur-md border border-white/[0.08] rounded-full px-2.5 py-1 h-9 shadow-[0_2px_12px_rgba(0,0,0,0.4)] animate-fadeIn select-none">
                {/* Play/Pause Button */}
                <button
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/[0.06] text-slate-350 hover:text-white transition-all focus:outline-none"
                  onClick={splitIsPaused ? resumeSimulation : pauseSimulation}
                  title={splitIsPaused ? 'Resume Simulation' : 'Pause Simulation'}
                >
                  {splitIsPaused ? (
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  )}
                </button>

                {/* Stop Button */}
                <button
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-500/10 text-red-400/90 hover:text-red-400 transition-all focus:outline-none"
                  onClick={stopSimulation}
                  title="Stop Simulation"
                >
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
                    <rect x="5" y="5" width="14" height="14" rx="1.5" />
                  </svg>
                </button>

                {/* Separator 1 */}
                <div className="w-[1px] h-4 bg-white/[0.12]" />

                {/* Speed Controls */}
                <div className="flex items-center gap-0.5">
                  {([1, 5, 10, 20] as const).map((spd) => {
                    const isActive = splitSimSpeed === spd;
                    return (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setSpeed(spd)}
                        className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded-full transition-all duration-150 focus:outline-none ${
                          isActive
                            ? 'bg-[#0e2a35] text-cyan-400 border border-cyan-400/40 shadow-[0_0_8px_rgba(34,211,238,0.22)]'
                            : 'border border-transparent text-slate-500 hover:text-slate-350 hover:bg-white/[0.04]'
                        }`}
                      >
                        {spd}x
                      </button>
                    );
                  })}
                </div>

                {/* Separator 2 */}
                <div className="w-[1px] h-4 bg-white/[0.12]" />

                {/* Simulation timer */}
                <div className="flex items-center pr-1.5 text-[10px] font-mono text-cyan-400 tabular-nums">
                  <span>{fmtClock(splitSimTimeS)}</span>
                  <span className="text-slate-500 ml-1">/ {fmtClock(Number(simConfig.simulation_duration_s ?? 1800))}</span>
                </div>
              </div>
            )}

            {/* Panel toggles */}
            <div className="ml-auto flex gap-2">
              {/* Config opens a full modal dialog */}
              <button
                type="button"
                disabled={true}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all opacity-40 cursor-not-allowed"
                style={{
                  background: 'transparent',
                  borderColor: 'rgba(255,255,255,0.04)',
                  color: '#475569',
                }}
                title="Simulation configuration is currently disabled"
              >
                <svg viewBox="0 0 20 20" className="w-3 h-3 flex-shrink-0" fill="currentColor">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54A.484.484 0 0 0 14 2h-4c-.24 0-.43.17-.47.39l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L3.32 9.13a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.07.63-.07.94s.02.64.07.94l-2.03 1.58a.47.47 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h4c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                </svg>
                Config
              </button>
            </div>
          </div>

          {/* KPI Cards — only shown when not training */}
          {!isTraining && <KpiCards />}


          {/* Canvas */}
          <div className="bg-[#0b0f17] rounded-2xl border border-white/[0.06] overflow-hidden relative">

            <div className="p-4">
              {viewMode === 'single' ? (
                <div className="flex flex-col lg:flex-row gap-4 items-start justify-center overflow-x-auto">
                  {(() => {
                    if (selectedModelSingle === 'baseline') {
                      // Baseline: Canvas | Live Stats or Config | Toggle
                      return (
                        <>
                          {/* Left Column: SimCanvas */}
                          <div className="relative flex items-center justify-center bg-black/20 rounded-xl p-1.5 border border-white/[0.05] flex-shrink-0 animate-fadeIn">
                            <SimCanvas
                              key="baseline"
                              width={720}
                              height={560}
                              label="Baseline"
                              frameOverride={baselineFrame}
                              speedValue={simSpeed}
                              onSpeedChange={setSpeed}
                              onPlayPause={isPaused ? resumeSimulation : pauseSimulation}
                              onStop={stopSimulation}
                              isPaused={isPaused}
                              isRunning={isRunning}
                            />
                          </div>

                          <div className="animate-fadeIn flex-shrink-0">
                            {baselineRightTab === 'stats' ? (
                              <SimLiveStatsPanel />
                            ) : (
                              <RLConfigDetailsPanel modelKey="baseline" />
                            )}
                          </div>

                          <div className="w-[56px] flex-shrink-0 flex justify-center self-start">
                            <div className="w-[48px] flex flex-col bg-[#080c12]/90 border border-white/[0.07] p-1 rounded-xl gap-2 shadow-lg items-center justify-center animate-fadeIn">
                              <button
                                type="button"
                                className={`w-[40px] h-[46px] flex flex-col items-center justify-center rounded-lg transition-all duration-200 ${baselineRightTab === 'config'
                                  ? 'bg-slate-700/30 text-slate-100 border border-slate-500'
                                  : 'text-gray-500 hover:text-gray-300 border border-transparent hover:bg-gray-900/40'
                                  }`}
                                onClick={() => setBaselineRightTab('config')}
                                title="Configuration Specs"
                              >
                                <span className="text-[13px] leading-none font-bold">CFG</span>
                                <span className="text-[7px] font-mono font-extrabold uppercase tracking-wide mt-1.5 leading-none">SPECS</span>
                              </button>
                              <button
                                type="button"
                                className={`w-[40px] h-[46px] flex flex-col items-center justify-center rounded-lg transition-all duration-200 ${baselineRightTab === 'stats'
                                  ? 'bg-slate-700/30 text-slate-100 border border-slate-500'
                                  : 'text-gray-500 hover:text-gray-300 border border-transparent hover:bg-gray-900/40'
                                  }`}
                                onClick={() => setBaselineRightTab('stats')}
                                title="Live Stats Panel"
                              >
                                <span className="text-[13px] leading-none font-bold">SIM</span>
                                <span className="text-[7px] font-mono font-extrabold uppercase tracking-wide mt-1.5 leading-none">LIVE</span>
                              </button>
                            </div>
                          </div>
                        </>
                      )
                    }

                    // It's an RL Agent
                    const isTrained = trainedModels.includes(selectedModelSingle)
                    const showToggles = isActiveModelTraining || isTrained

                    if (!showToggles) {
                      return (
                        <>
                          <div className="animate-fadeIn flex-shrink-0">
                            <RLTrainingHUD
                              modelKey={selectedModelSingle}
                              trainingMode={trainingMode}
                              onTrainingModeChange={setTrainingMode}
                            />
                          </div>
                          <div className="animate-fadeIn flex-shrink-0">
                            <RLConfigDetailsPanel modelKey={selectedModelSingle} />
                          </div>
                          <div className="w-[56px] flex-shrink-0" />
                        </>
                      )
                    } else {
                      const labelMap: Record<string, string> = {
                        rl1: 'RL Agent 1 (PPO)',
                        rl2: 'RL Agent 2 (DQN)',
                        rl3: 'RL Agent 3 (SAC)',
                        rl4: 'RL Agent 4 (A2C)',
                        custom: 'Custom RL Agent',
                      }
                      const activeLabel = labelMap[selectedModelSingle] ?? 'RL Agent'

                      return (
                        <>
                          <div className="relative flex items-center justify-center bg-black/20 rounded-xl p-1.5 border border-white/[0.05] flex-shrink-0 animate-fadeIn">
                            {isActiveModelTraining ? (
                              <XaiLiveCanvas />
                            ) : (
                              <SimCanvas
                                key={selectedModelSingle}
                                width={720}
                                height={560}
                                label={activeLabel}
                                frameOverride={
                                  selectedModelSingle === 'rl1' ? rl1Frame :
                                    selectedModelSingle === 'rl2' ? rl2Frame :
                                      selectedModelSingle === 'rl3' ? rl3Frame :
                                        selectedModelSingle === 'rl4' ? rl4Frame :
                                          selectedModelSingle === 'custom' ? customFrame :
                                            null
                                }
                                speedValue={simSpeed}
                                onSpeedChange={setSpeed}
                                onPlayPause={isPaused ? resumeSimulation : pauseSimulation}
                                onStop={stopSimulation}
                                isPaused={isPaused}
                                isRunning={isRunning}
                              />
                            )}
                          </div>

                          <div className="animate-fadeIn flex-shrink-0">
                            {rightColumnTab === 'config' && <RLConfigDetailsPanel modelKey={selectedModelSingle} />}
                            {rightColumnTab === 'neural' && <RLNeuralPanel modelKey={selectedModelSingle} />}
                            {rightColumnTab === 'stats' && <SimLiveStatsPanel />}
                          </div>

                          <div className="w-[56px] flex-shrink-0 flex justify-center self-start">
                            <div className="w-[48px] flex flex-col bg-[#080c12]/90 border border-white/[0.07] p-1 rounded-xl gap-1.5 shadow-lg animate-fadeIn items-center">
                              {(
                                [
                                  { key: 'config', label: 'CFG', sub: 'SPECS', title: 'Hyperparameter Specs' },
                                  { key: 'neural', label: 'NRAL', sub: 'PROC', title: 'Neural Processing' },
                                  { key: 'stats', label: 'SIM', sub: 'DATA', title: 'Simulation Data' },
                                ] as const
                              ).map(({ key, label, sub, title }) => (
                                <button
                                  key={key}
                                  type="button"
                                  title={title}
                                  onClick={() => setRightColumnTab(key)}
                                  className={`w-[40px] h-[44px] flex flex-col items-center justify-center rounded-lg transition-all duration-200 ${rightColumnTab === key
                                    ? 'bg-slate-700/30 text-slate-100 border border-slate-500'
                                    : 'text-gray-500 hover:text-gray-300 border border-transparent hover:bg-gray-900/40'
                                    }`}
                                >
                                  <span className="text-[11px] leading-none font-bold">{label}</span>
                                  <span className="text-[6.5px] font-mono font-extrabold uppercase tracking-wide mt-1 leading-none">{sub}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )
                    }
                  })()}
                </div>
              ) : (
                <SplitCanvas />
              )}
            </div>{/* /p-4 inner */}
          </div>

          {/* Analytics row — only shown when not training */}
          {!isTraining && (
            <div className="bg-[#0b0f17] rounded-2xl border border-white/[0.06] p-4 transition-all duration-300 shadow-[0_2px_16px_rgba(0,0,0,0.35)] animate-fadeIn">
              <button
                type="button"
                className="w-full flex items-center justify-between focus:outline-none group"
                onClick={() => setIsAnalyticsCollapsed(!isAnalyticsCollapsed)}
              >
                <h3 className="text-xs font-semibold flex items-center gap-2 text-slate-300 uppercase tracking-widest">
                  <span className="w-1 h-3 rounded-full bg-[#8fb8ce]/60 inline-block" />
                  Live Optimization Analytics
                  <HelpPopover text="### Real-Time Analytics\nTelemetrical charts detailing signal optimization improvements:\n- **Before vs After**: Live wait time comparisons (Baseline vs Active Agent).\n- **Queue Heatmap**: Spatial density representing backlog build-up per arm (North, South, East, West).\n- **Phase Timeline**: Chronological track of phase intervals executed by the controller." position="right" />
                </h3>
                <span className="text-[10px] text-slate-600 font-mono select-none group-hover:text-slate-400 transition-colors">
                  {isAnalyticsCollapsed ? 'EXPAND ↓' : 'COLLAPSE ↑'}
                </span>
              </button>

              {!isAnalyticsCollapsed && (
                <div className="mt-4 border-t border-white/[0.05] pt-4 grid grid-cols-3 gap-4 animate-fadeIn">
                  <div className="bg-black/20 rounded-xl border border-white/[0.04] p-4">
                    <BeforeAfterChart />
                  </div>
                  <div className="bg-black/20 rounded-xl border border-white/[0.04] p-4">
                    <QueueHeatmap />
                  </div>
                  <div className="bg-black/20 rounded-xl border border-white/[0.04] p-4">
                    <PhaseTimeline />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* How the AI learns — only shown when training */}
          {isTraining && (
            <div className="bg-[#0b0f17] rounded-2xl border border-white/[0.06] p-4 transition-all duration-300 shadow-[0_2px_16px_rgba(0,0,0,0.35)] animate-fadeIn">
              <button
                type="button"
                className="w-full flex items-center justify-between focus:outline-none group"
                onClick={() => setIsLearningCollapsed(!isLearningCollapsed)}
              >
                <h3 className="text-xs font-semibold flex items-center gap-2 text-slate-300 uppercase tracking-widest">
                  <span className="w-1 h-3 rounded-full bg-[#8fb8ce]/60 inline-block" />
                  How the AI Learns
                  <HelpPopover text={getRlExplainerHelp()} position="right" />
                </h3>
                <span className="text-[10px] text-slate-600 font-mono select-none group-hover:text-slate-400 transition-colors">
                  {isLearningCollapsed ? 'EXPAND ↓' : 'COLLAPSE ↑'}
                </span>
              </button>

              {!isLearningCollapsed && (
                <div className="mt-4 border-t border-white/[0.05] pt-4 space-y-3 animate-fadeIn">
                  <TrainingExplainer />
                </div>
              )}
            </div>
          )}

          {/* Training + Insights — only shown when training */}
          {isTraining && (
            <div className="bg-[#0b0f17] rounded-2xl border border-white/[0.06] p-4 transition-all duration-300 shadow-[0_2px_16px_rgba(0,0,0,0.35)] animate-fadeIn">
              <button
                type="button"
                className="w-full flex items-center justify-between focus:outline-none group"
                onClick={() => setIsTrainingCollapsed(!isTrainingCollapsed)}
              >
                <h3 className="text-xs font-semibold flex items-center gap-2 text-slate-300 uppercase tracking-widest">
                  <span className="w-1 h-3 rounded-full bg-[#8fb8ce]/60 inline-block" />
                  Training Progress &amp; Insights
                  <HelpPopover text="### Neural Net Training Progress\nStreams real-time episodes and strategy milestones:\n- **Value Chart**: Renders training reward scores over episodes. A value flattening toward zero represents convergence.\n- **Milestone Insights**: Highlight events where the agent beats baseline rules or learns specific priorities." position="right" />
                </h3>
                <span className="text-[10px] text-slate-600 font-mono select-none group-hover:text-slate-400 transition-colors">
                  {isTrainingCollapsed ? 'EXPAND ↓' : 'COLLAPSE ↑'}
                </span>
              </button>

              {!isTrainingCollapsed && (
                <div className="mt-4 border-t border-white/[0.05] pt-4 grid grid-cols-2 gap-4 animate-fadeIn">
                  <div className="bg-black/20 rounded-xl border border-white/[0.04] p-4 space-y-2">
                    <h3 className="text-[10px] font-bold text-slate-500 font-mono flex items-center gap-1 uppercase tracking-widest">
                      TRAINING EPISODES VALUE CHART
                      <HelpPopover text="### Training Episodes Value Chart\nStreams learning convergence metrics in real time:\n- **Cyan (Reward)**: Cumulative reinforcement reward score per episode. Escalating score signifies active learning.\n- **Orange (Wait s)**: Average vehicle delay seconds. Shrinking delay signals signal splits optimization." position="top" />
                    </h3>
                    <TrainingChart />
                  </div>
                  <div className="bg-black/20 rounded-xl border border-white/[0.04] p-4 space-y-2">
                    <h3 className="text-[10px] font-bold text-slate-500 font-mono flex items-center gap-1 uppercase tracking-widest">
                      STRATEGY MILESTONES
                      <HelpPopover text="### Strategy Milestones\nIdentifies specific qualitative traffic strategy accomplishments unlocked during learning, such as learning to clear major bottlenecks or prioritizing high vehicle occupancy lanes." position="top" />
                    </h3>
                    <InsightCards />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Economic projector — only shown when not training */}
          {!isTraining && (
            <div className="bg-[#0b0f17] rounded-2xl border border-white/[0.06] p-4 transition-all duration-300 shadow-[0_2px_16px_rgba(0,0,0,0.35)] animate-fadeIn">
              <button
                type="button"
                className="w-full flex items-center justify-between focus:outline-none group"
                onClick={() => setIsEconomicCollapsed(!isEconomicCollapsed)}
              >
                <h3 className="text-xs font-semibold flex items-center gap-2 text-slate-300 uppercase tracking-widest">
                  <span className="w-1 h-3 rounded-full bg-[#8fb8ce]/60 inline-block" />
                  Economic Impact Projections
                  <HelpPopover text="### Blended Fleet Economic Impact\nDynamic projector calculating environmental and economic savings:\n- **Fuel Saved**: Blended fleet idle fuel reductions ($0.7$ liters/hour rate).\n- **CO2 Avoided**: $2.31$ kg per liter reduction factor.\n- **Financial Gains**: Sum of time-value wages ($\mathbb{INR}\ 150$/hour) and fuel savings ($\mathbb{INR}\ 105$/liter)." position="right" />
                </h3>
                <span className="text-[10px] text-slate-600 font-mono select-none group-hover:text-slate-400 transition-colors">
                  {isEconomicCollapsed ? 'EXPAND ↓' : 'COLLAPSE ↑'}
                </span>
              </button>

              {!isEconomicCollapsed && (
                <div className="mt-4 border-t border-white/[0.05] pt-3 animate-fadeIn">
                  <EconomicProjector economic={economic} />
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Right sidebar — only visible when a panel is active ── */}
        {activePanel !== null && (
          <div className="w-72 flex-shrink-0 flex flex-col border-l border-white/[0.06] bg-[#080b10]">

            {/* Sidebar header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06] bg-[#0a0d14] flex-shrink-0">
              <div className="flex items-start gap-3">
                {/* Accent icon block */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${activePanel === 'stats' ? 'bg-[#8fb8ce]/10 border border-[#8fb8ce]/20' :
                  activePanel === 'xai' ? 'bg-[#818cf8]/10 border border-[#818cf8]/20' :
                    'bg-white/[0.04] border border-white/[0.10]'
                  }`}>
                  {activePanel === 'stats' && (
                    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-[#8fb8ce]">
                      <rect x="1" y="9" width="3" height="6" rx="1" fill="currentColor" opacity="0.6" />
                      <rect x="6" y="5" width="3" height="10" rx="1" fill="currentColor" opacity="0.8" />
                      <rect x="11" y="1" width="3" height="14" rx="1" fill="currentColor" />
                    </svg>
                  )}
                  {activePanel === 'xai' && (
                    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-[#818cf8]">
                      <circle cx="8" cy="8" r="2.5" fill="currentColor" />
                      <circle cx="3" cy="4" r="1.5" fill="currentColor" opacity="0.5" />
                      <circle cx="13" cy="4" r="1.5" fill="currentColor" opacity="0.5" />
                      <circle cx="3" cy="12" r="1.5" fill="currentColor" opacity="0.5" />
                      <circle cx="13" cy="12" r="1.5" fill="currentColor" opacity="0.5" />
                      <line x1="8" y1="5.5" x2="3" y2="5.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                      <line x1="8" y1="5.5" x2="13" y2="5.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                      <line x1="8" y1="10.5" x2="3" y2="10.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                      <line x1="8" y1="10.5" x2="13" y2="10.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
                    </svg>
                  )}
                  {activePanel === 'config' && (
                    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-slate-400">
                      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
                      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className="text-[13px] font-bold text-slate-100 leading-tight tracking-tight">
                    {activePanel === 'stats' ? 'Live Stats'
                      : activePanel === 'xai' ? 'XAI Explainability'
                        : 'Configuration'}
                  </h3>
                  <p className="text-[9px] text-slate-600 font-mono mt-0.5 uppercase tracking-widest">
                    {activePanel === 'stats' ? 'Real-time metrics'
                      : activePanel === 'xai' ? 'Decision explainer'
                        : 'Simulation parameters'}
                  </p>
                </div>
              </div>
              <button
                className="text-slate-600 hover:text-slate-300 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-all border border-transparent hover:border-white/[0.08] text-sm"
                onClick={() => setActivePanel(null)}
                title="Close"
              >×</button>
            </div>

            {/* Scrollable panel body */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">

              {activePanel === 'stats' && <SimStatsPanel />}

              {activePanel === 'xai' && (
                <XaiPanel
                  reason="Agent prioritising north-south green to clear queue buildup"
                  features={[
                    { name: 'queue_north', importance: 0.32, value: 0.8, shap: 0.32 },
                    { name: 'wait_south', importance: 0.21, value: 0.6, shap: 0.21 },
                    { name: 'flow_east', importance: 0.15, value: 0.4, shap: 0.15 },
                    { name: 'time_of_day', importance: 0.12, value: 0.3, shap: 0.12 },
                    { name: 'total_delay', importance: 0.10, value: 0.7, shap: 0.10 },
                  ]}
                />
              )}

              {/* Config is now a full modal — no sidebar panel for it */}

            </div>
          </div>
        )}

      </div>

      {/* ── Config Modal ── */}
      <ConfigModal
        open={configModalOpen}
        mode={configModalMode}
        onClose={() => setConfigModalOpen(false)}
        onApply={configModalMode === 'training' ? handleStartTraining : handleUpdateSim}
        isBaselineView={selectedModelSingle === 'baseline'}
        activeModelKey={selectedModelSingle}
      />

    </div>
  )
}
