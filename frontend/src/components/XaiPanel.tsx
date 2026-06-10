import HelpPopover from './HelpPopover'

interface FeatureBar {
  name: string
  importance: number
  value: number
  shap: number
}

interface XaiPanelProps {
  features?: FeatureBar[]
  reason?: string
  loading?: boolean
}

const FEATURE_COLORS: Record<string, string> = {
  queue: '#00d4ff',
  wait: '#f59e0b',
  flow: '#10b981',
  heavy: '#a78bfa',
  phase: '#f87171',
  time: '#60a5fa',
  delay: '#fb923c',
  emergency: '#ef4444',
  adverse: '#dc2626',
}

function getFeatureColor(name: string): string {
  for (const [key, color] of Object.entries(FEATURE_COLORS)) {
    if (name.toLowerCase().includes(key)) return color
  }
  return '#9ca3af'
}

export default function XaiPanel({ features = [], reason, loading }: XaiPanelProps) {
  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[...Array(5)].map((_, i) => <div key={i} className="h-6 bg-gray-800 rounded" />)}
      </div>
    )
  }

  const maxImportance = Math.max(...features.map((f) => Math.abs(f.importance)), 0.001)

  return (
    <div className="space-y-4">
      {reason && (
        <div className="bg-gray-800 rounded-lg p-3 border-l-4 border-purple-500">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            Agent Decision
            <HelpPopover text="### Agent Decision Reason\nExplains the immediate physical rationale behind the neural network's current action (e.g. extending green or terminating early to prioritize high queue lanes)." position="left" />
          </p>
          <p className="text-sm text-gray-200">{reason}</p>
        </div>
      )}

      <div>
        <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-1">
          Feature Importance (SHAP)
          <HelpPopover text="### Feature Importance (SHAP)\nUses Shapley Additive Explanations to quantify how each sensor reading influences the neural decision:\n- **SHAP values**: Measures the contribution of each state variable (e.g. $queue\\_north$, $wait\\_south$) to the output score.\n- **Formula**:\n$$\\phi_i(x) = \\sum_{S \\subseteq F \\setminus \\{i\\}} \\frac{|S|!(|F| - |S| - 1)!}{|F|!} \\left[ f(S \\cup \\{i\\}) - f(S) \\right]$$\nWhere $\\phi_i$ is the SHAP weight for sensor $i$, $F$ is all sensors, and $S$ represents subset coalitions." position="left" />
        </p>
        <div className="space-y-1.5">
          {features.slice(0, 10).map((f) => {
            const color = getFeatureColor(f.name)
            const width = (Math.abs(f.importance) / maxImportance) * 100
            return (
              <div key={f.name} className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400 w-32 truncate">{f.name}</span>
                <div className="flex-1 bg-gray-800 rounded h-4 relative overflow-hidden">
                  <div
                    className="h-full rounded transition-all duration-300"
                    style={{ width: `${width}%`, backgroundColor: color }}
                  />
                </div>
                <span className="text-xs font-mono text-gray-500 w-12 text-right">
                  {f.importance.toFixed(3)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
