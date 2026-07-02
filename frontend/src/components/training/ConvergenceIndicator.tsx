import { motion } from 'framer-motion'
import { useSessionStore } from '../../store/sessionStore'
import { useConfigStore } from '../../store/configStore'

export default function ConvergenceIndicator() {
  const isConverged = useSessionStore((s) => s.isConverged)
  const isTraining = useSessionStore((s) => s.isTraining)
  const episodes = useSessionStore((s) => s.episodes)
  const trainingMode = useSessionStore((s) => s.trainingMode)
  const { simConfig } = useConfigStore()

  if (!isTraining && episodes.length === 0) return null

  const totalSteps = Number(simConfig.total_timesteps ?? 20000)
  const resolvedTrainingMode = simConfig.training_mode ?? trainingMode

  const explicitEpisodeCap = Number(simConfig.training_episodes ?? 0)
  let totalEpisodes = explicitEpisodeCap > 0 ? explicitEpisodeCap : 500
  if (explicitEpisodeCap <= 0) {
    if (resolvedTrainingMode === 'stage1' || resolvedTrainingMode === 'stage2') {
      totalEpisodes = Math.round(totalSteps / 40)
    } else if (resolvedTrainingMode === 'stage3') {
      totalEpisodes = Math.round(totalSteps / 360)
    } else if (resolvedTrainingMode === 'stage4') {
      totalEpisodes = Math.round((totalSteps * 0.6) / 40 + (totalSteps * 0.4) / 360)
    }
  }

  const hasReachedCap = episodes.length >= totalEpisodes

  return (
    <div className="flex items-center gap-2">
      {isConverged || (!isTraining && hasReachedCap) ? (
        <motion.div
          className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-500/40 rounded-full px-3 py-1"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
        >
          <span className="text-emerald-400 text-[10px] font-mono uppercase">Done</span>
          <span className="text-emerald-400 text-xs font-mono">
            {isConverged ? 'Converged' : `Done (ep ${episodes.length})`}
          </span>
        </motion.div>
      ) : isTraining ? (
        <motion.div
          className="flex items-center gap-2 bg-cyan-900/30 border border-cyan-500/40 rounded-full px-3 py-1"
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
        >
          <span className="text-cyan-400 text-[10px] font-mono uppercase">Run</span>
          <span className="text-cyan-400 text-xs font-mono">
            Training... ep {episodes.length}
          </span>
        </motion.div>
      ) : (
        <div className="flex items-center gap-2 bg-gray-800 border border-gray-600 rounded-full px-3 py-1">
          <span className="text-gray-400 text-xs font-mono">Training stopped (ep {episodes.length})</span>
        </div>
      )}
    </div>
  )
}
