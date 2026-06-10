import { motion, AnimatePresence } from 'framer-motion'
import { useSessionStore } from '../store/sessionStore'
import type { InsightCard } from '../types'

const CARD_TYPE_STYLES = {
  milestone: 'border-purple-500/40 bg-purple-900/20',
  achievement: 'border-emerald-500/40 bg-emerald-900/20',
  warning: 'border-amber-500/40 bg-amber-900/20',
}

function InsightCardItem({ card }: { card: InsightCard }) {
  return (
    <motion.div
      className={`border rounded-lg p-3 flex items-start gap-3 ${CARD_TYPE_STYLES[card.card_type] ?? CARD_TYPE_STYLES.milestone}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      layout
    >
      <span className="text-xl flex-shrink-0">{card.icon}</span>
      <div>
        <p className="text-sm text-gray-200">{card.message}</p>
        <p className="text-xs text-gray-500 mt-0.5">Episode {card.episode_number}</p>
      </div>
    </motion.div>
  )
}

export default function InsightCards() {
  const insights = useSessionStore((s) => s.insights)

  if (insights.length === 0) {
    return (
      <div className="text-center text-gray-500 py-4 text-sm">
        Insights will appear as training progresses...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
      <AnimatePresence mode="popLayout">
        {[...insights].reverse().map((card, i) => (
          <InsightCardItem key={`${card.episode_number}_${i}`} card={card} />
        ))}
      </AnimatePresence>
    </div>
  )
}
