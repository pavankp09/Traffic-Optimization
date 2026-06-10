import { motion } from 'framer-motion'
import { useSessionStore } from '../store/sessionStore'

export default function ConvergenceIndicator() {
  const isConverged = useSessionStore((s) => s.isConverged)
  const isTraining = useSessionStore((s) => s.isTraining)
  const episodes = useSessionStore((s) => s.episodes)

  if (!isTraining && episodes.length === 0) return null

  return (
    <div className="flex items-center gap-2">
      {isConverged ? (
        <motion.div
          className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-500/40 rounded-full px-3 py-1"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
        >
          <span className="text-emerald-400 text-[10px] font-mono uppercase">Done</span>
          <span className="text-emerald-400 text-xs font-mono">Converged</span>
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
