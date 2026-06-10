import { useSessionStore } from '../store/sessionStore'
import HelpPopover from './HelpPopover'
import RLBrainVisualizer from './RLBrainVisualizer'

const STEPS = [
  {
    icon: '1',
    title: 'Observe',
    color: '#22d3ee',
    headline: '22 live signals',
    detail: 'Queue length, waiting time and flow on every approach, read continuously.',
  },
  {
    icon: '2',
    title: 'Decide',
    color: '#a78bfa',
    headline: '35 possible moves',
    detail: 'Pick the next green phase and hold duration based on live conditions.',
  },
  {
    icon: '3',
    title: 'Reward',
    color: '#34d399',
    headline: 'Score the outcome',
    detail: 'Reward increases with flow and decreases with queue, delay, and conflicts.',
  },
  {
    icon: '4',
    title: 'Improve',
    color: '#f59e0b',
    headline: 'PPO updates the policy',
    detail: 'Each episode nudges the policy toward actions that produce better outcomes.',
  },
]

function pct(from: number, to: number): number {
  if (!isFinite(from) || from <= 0) return 0
  return Math.round(((from - to) / from) * 100)
}

export default function TrainingExplainer() {
  const baseline = useSessionStore((s) => s.baselineMetrics)
  const current = useSessionStore((s) => s.currentMetrics)
  const episodes = useSessionStore((s) => s.episodes)
  const isConverged = useSessionStore((s) => s.isConverged)
  const isTraining = useSessionStore((s) => s.isTraining)

  const epCount = episodes.length
  const baseWait = baseline?.avg_wait_s ?? null
  const rlWait = current?.avg_wait_s ?? null
  const waitDropPct = baseWait !== null && rlWait !== null ? pct(baseWait, rlWait) : null

  const baseTp = baseline?.throughput_vph ?? null
  const rlTp = current?.throughput_vph ?? null
  const tpGainPct = baseTp !== null && rlTp !== null && baseTp > 0
    ? Math.round(((rlTp - baseTp) / baseTp) * 100)
    : null

  const waitImproved = waitDropPct !== null && waitDropPct >= 0
  const tpImproved = tpGainPct !== null && tpGainPct >= 0

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-gray-400">
        A fixed-time signal repeats the same green pattern no matter what is on the road.
        Our agent <span className="text-cyan-400">watches traffic and re-times every cycle</span>
        through trial-and-reward, not hand-written rules.
      </p>

      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            className="relative rounded-lg border bg-gray-950/60 p-2"
            style={{ borderColor: `${s.color}40` }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-mono text-gray-300">{s.icon}</span>
              <span className="text-[11px] font-semibold" style={{ color: s.color }}>
                {s.title}
              </span>
            </div>
            <div className="mt-1 text-[10px] font-mono text-gray-200">{s.headline}</div>
            <div className="mt-0.5 text-[9px] leading-snug text-gray-500">{s.detail}</div>
            {i < STEPS.length - 1 && (
              <span className="absolute -right-[7px] top-1/2 -translate-y-1/2 text-gray-600 text-xs z-10">
                {'>'}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-700 bg-gradient-to-r from-gray-900 to-gray-950 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-gray-300 flex items-center gap-1">
            How RL made the difference
            <HelpPopover text="### How RL Made the Difference\nContrasts the dynamic learning agent against static pre-timed baseline limits:\n- **Avg Wait**: Reduction in mean stopped time per vehicle.\n- **Throughput**: Increase in cleared vehicles per hour.\n- **Episodes**: Number of completed training runs." position="top" />
          </span>
          {isConverged ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Converged
            </span>
          ) : isTraining ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              Learning ep {epCount}
            </span>
          ) : (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-700/40 text-gray-500 border border-gray-700">
              Idle
            </span>
          )}
        </div>

        {waitDropPct === null ? (
          <p className="text-[11px] text-gray-500">
            Start training to watch the agent beat the fixed-time baseline in real time.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-[9px] uppercase tracking-wider text-gray-500">Avg Wait</div>
              <div className="flex items-baseline justify-center gap-1 mt-0.5">
                <span className="text-[11px] text-gray-500 line-through">{baseWait!.toFixed(0)}s</span>
                <span className="text-gray-600">to</span>
                <span className={`text-sm font-bold ${waitImproved ? 'text-emerald-400' : 'text-red-400'}`}>
                  {rlWait!.toFixed(0)}s
                </span>
              </div>
              <div className={`text-[10px] font-semibold mt-0.5 ${waitImproved ? 'text-emerald-400' : 'text-red-400'}`}>
                {waitImproved ? `-${waitDropPct}% faster` : `+${-waitDropPct!}% slower`}
              </div>
            </div>

            <div className="text-center border-x border-gray-800">
              <div className="text-[9px] uppercase tracking-wider text-gray-500">Throughput</div>
              <div className="flex items-baseline justify-center gap-1 mt-0.5">
                <span className="text-[11px] text-gray-500 line-through">{baseTp ?? 0}</span>
                <span className="text-gray-600">to</span>
                <span className={`text-sm font-bold ${tpImproved ? 'text-cyan-400' : 'text-red-400'}`}>
                  {rlTp ?? 0}
                </span>
              </div>
              <div className={`text-[10px] font-semibold mt-0.5 ${tpImproved ? 'text-cyan-400' : 'text-red-400'}`}>
                {tpGainPct !== null ? `${tpGainPct >= 0 ? '+' : ''}${tpGainPct}%` : '-'} vph
              </div>
            </div>

            <div className="text-center">
              <div className="text-[9px] uppercase tracking-wider text-gray-500">Learned over</div>
              <div className="text-sm font-bold text-purple-400 mt-1">{epCount}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">episodes</div>
            </div>
          </div>
        )}
      </div>

      <RLBrainVisualizer />
    </div>
  )
}
