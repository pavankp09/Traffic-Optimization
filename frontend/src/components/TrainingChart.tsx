import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts'
import { useSessionStore } from '../store/sessionStore'

export default function TrainingChart() {
  const rewardCurve = useSessionStore((s) => s.rewardCurve)
  const waitCurve = useSessionStore((s) => s.waitCurve)
  const baseline = useSessionStore((s) => s.baselineMetrics)

  const baselineWait = baseline?.avg_wait_s ?? null

  const data = rewardCurve.map((reward, idx) => ({
    episode: idx + 1,
    reward: parseFloat(reward.toFixed(2)),
    wait_s: parseFloat((waitCurve[idx] ?? 0).toFixed(1)),
  }))

  // Downsample if too many points
  const sampled = data.length > 200
    ? data.filter((_, i) => i % Math.ceil(data.length / 200) === 0)
    : data

  if (sampled.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        Waiting for training to start...
      </div>
    )
  }

  const latest = data[data.length - 1]

  return (
    <div>
      {/* Live readout + axis legend */}
      <div className="flex items-center justify-between mb-1 text-[10px]">
        <div className="flex gap-3">
          <span className="text-cyan-400">Reward ↑ better: <span className="font-mono font-semibold">{latest.reward}</span></span>
          <span className="text-amber-400">Wait ↓ better: <span className="font-mono font-semibold">{latest.wait_s}s</span></span>
        </div>
        {baselineWait !== null && (
          <span className="text-gray-500">Fixed-timer baseline: <span className="font-mono">{baselineWait.toFixed(0)}s</span></span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={sampled} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="episode" stroke="#6b7280" tick={{ fontSize: 10 }} label={{ value: 'Episode', position: 'insideBottom', offset: -2, fill: '#6b7280', fontSize: 10 }} />
          <YAxis yAxisId="left" stroke="#00d4ff" tick={{ fontSize: 10 }} />
          <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#9ca3af' }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
          {baselineWait !== null && (
            <ReferenceLine
              yAxisId="right"
              y={baselineWait}
              stroke="#ef4444"
              strokeDasharray="4 4"
              strokeOpacity={0.7}
              label={{ value: 'fixed-timer', position: 'insideTopRight', fill: '#ef4444', fontSize: 9 }}
            />
          )}
          <Line yAxisId="left" type="monotone" dataKey="reward" stroke="#00d4ff" dot={false} strokeWidth={1.5} name="Reward (↑)" />
          <Line yAxisId="right" type="monotone" dataKey="wait_s" stroke="#f59e0b" dot={false} strokeWidth={1.5} name="Wait s (↓)" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
