import React from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import type { Scenario } from './types'

const CHART_COLORS = [
  '#10b981', '#6366f1', '#f59e0b', '#ef4444',
  '#ec4899', '#14b8a6', '#94a3b8', '#06b6d4',
]

interface Props {
  scenarios: Scenario[]
  onDone?: () => void
}

function pct(value: number, baseline: number) {
  if (!baseline) return null
  return ((value - baseline) / baseline) * 100
}

function DeltaCell({ delta }: { delta: number | null }) {
  if (delta === null) return <td className="ro-delta-neutral">—</td>
  const positive = delta > 0
  // For wait: positive delta (higher wait) is bad; for throughput: positive is good
  return (
    <td className={delta === 0 ? 'ro-delta-neutral' : ''}>
      {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
    </td>
  )
}

export default function ResultsPanel({ scenarios, onDone }: Props) {
  const done = scenarios.filter(s => s.status === 'done' && s.kpi)
  if (done.length === 0) {
    return (
      <div className="ro-results-area">
        <div className="ro-section-header" style={{ marginBottom: 12 }}>Results</div>
        <div className="ro-empty">
          <div className="ro-empty-text">Run at least one scenario to see comparison results.</div>
        </div>
      </div>
    )
  }

  const baseline = done.find(s => s.scenario_type === 'baseline')
  const baseWait = baseline?.kpi?.avg_wait_s ?? 0
  const baseTput = baseline?.kpi?.throughput_vph ?? 0

  // Filter out baseline to compare actual road modifications
  const mods = done.filter(s => s.scenario_type !== 'baseline')

  // Find best wait time (lowest delay is best)
  const bestWaitScenario = mods.length > 0
    ? [...mods].sort((a, b) => (a.kpi?.avg_wait_s ?? 999) - (b.kpi?.avg_wait_s ?? 999))[0]
    : null

  // Find best throughput (highest volume accommodated is best)
  const bestTputScenario = mods.length > 0
    ? [...mods].sort((a, b) => (b.kpi?.throughput_vph ?? 0) - (a.kpi?.throughput_vph ?? 0))[0]
    : null

  // Bar chart data
  const barData = done.map(s => ({
    name: s.label.length > 14 ? s.label.slice(0, 14) + '…' : s.label,
    throughput: s.kpi?.throughput_vph ?? 0,
    wait: s.kpi?.avg_wait_s ?? 0,
    reward: s.kpi?.episode_reward ?? 0,
  }))

  // Convergence line chart — merge all scenario curves
  const maxLen = Math.max(...done.map(s => s.kpi?.training_curve?.length ?? 0))
  const lineData: Record<string, unknown>[] = []
  for (let i = 0; i < maxLen; i++) {
    const point: Record<string, unknown> = { episode: 0 }
    done.forEach(s => {
      const curve = s.kpi?.training_curve ?? []
      if (curve[i]) {
        point.episode = curve[i].episode
        point[s.label] = curve[i].reward
      }
    })
    lineData.push(point)
  }

  const tooltipStyle = {
    backgroundColor: '#0f131a',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    fontSize: 11,
    color: '#e2e8f0',
  }

  return (
    <div className="ro-results-area">
      <div className="ro-scenarios-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div className="ro-section-header" style={{ margin: 0 }}>
          Comparison Results
          <span className="ro-section-chip">{done.length} scenarios</span>
        </div>
        <button
          id="ro-done-results-trigger"
          className="ro-btn ro-btn-primary"
          onClick={onDone}
          style={{
            fontSize: 12,
            background: 'rgba(16, 185, 129, 0.1)',
            borderColor: 'rgba(16, 185, 129, 0.35)',
            color: '#34d399',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}
        >
          Done
        </button>
      </div>

      {/* Best Performers Callout Cards */}
      {mods.length > 0 && (
        <div className="ro-best-grid">
          {/* Wait Time Winner */}
          {bestWaitScenario && bestWaitScenario.kpi && (
            <div className="ro-best-card ro-best-wait">
              <div className="ro-best-content">
                <div className="ro-best-badge">Efficiency Leader</div>
                <div className="ro-best-name">{bestWaitScenario.label}</div>
                <div className="ro-best-desc">Lowest vehicle delay of all tested modifications.</div>
              </div>
              <div className="ro-best-metric">
                <div className="ro-best-val">{bestWaitScenario.kpi.avg_wait_s}s</div>
                {pct(bestWaitScenario.kpi.avg_wait_s, baseWait) !== null && (
                  <div className={`ro-best-diff ${pct(bestWaitScenario.kpi.avg_wait_s, baseWait)! < 0 ? 'better' : 'worse'}`}>
                    {pct(bestWaitScenario.kpi.avg_wait_s, baseWait)! > 0 ? '+' : ''}{pct(bestWaitScenario.kpi.avg_wait_s, baseWait)!.toFixed(1)}% delay vs base
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Throughput Winner */}
          {bestTputScenario && bestTputScenario.kpi && (
            <div className="ro-best-card ro-best-tput">
              <div className="ro-best-content">
                <div className="ro-best-badge">Capacity Leader</div>
                <div className="ro-best-name">{bestTputScenario.label}</div>
                <div className="ro-best-desc">Highest vehicle flow accommodated.</div>
              </div>
              <div className="ro-best-metric">
                <div className="ro-best-val">{bestTputScenario.kpi.throughput_vph} vph</div>
                {pct(bestTputScenario.kpi.throughput_vph, baseTput) !== null && (
                  <div className={`ro-best-diff ${pct(bestTputScenario.kpi.throughput_vph, baseTput)! > 0 ? 'better' : 'worse'}`}>
                    {pct(bestTputScenario.kpi.throughput_vph, baseTput)! > 0 ? '+' : ''}{pct(bestTputScenario.kpi.throughput_vph, baseTput)!.toFixed(1)}% flow vs base
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Side-by-side table */}
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
        <table className="ro-results-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th>Type</th>
              <th>Avg Wait (s)</th>
              <th>Δ Wait</th>
              <th>Throughput (vph)</th>
              <th>Δ Throughput</th>
              <th>Flow Eff.</th>
              <th>Ep. Reward</th>
              <th>Depth</th>
            </tr>
          </thead>
          <tbody>
            {done.map((s, idx) => {
              const isBaseline = s.scenario_type === 'baseline'
              const waitDelta = isBaseline ? null : pct(s.kpi!.avg_wait_s, baseWait)
              const tputDelta = isBaseline ? null : pct(s.kpi!.throughput_vph, baseTput)

              const isBestWait = bestWaitScenario && s.scenario_id === bestWaitScenario.scenario_id
              const isBestTput = bestTputScenario && s.scenario_id === bestTputScenario.scenario_id
              const rowClass = isBestWait ? 'ro-row-best-wait' : isBestTput ? 'ro-row-best-tput' : ''

              return (
                <tr key={s.scenario_id} className={rowClass}>
                  <td style={{ color: CHART_COLORS[idx % CHART_COLORS.length], fontWeight: 600 }}>
                    {s.label}
                    {isBestWait && <span className="ro-perf-badge ro-perf-badge-wait">Best Delay</span>}
                    {isBestTput && <span className="ro-perf-badge ro-perf-badge-tput">Best Flow</span>}
                  </td>
                  <td style={{ color: '#64748b' }}>{s.scenario_type.replace(/_/g, ' ')}</td>
                  <td>{s.kpi!.avg_wait_s}s</td>
                  <td>
                    {waitDelta === null ? (
                      <span className="ro-delta-neutral">baseline</span>
                    ) : (
                      <span className={waitDelta < 0 ? 'ro-delta-positive' : 'ro-delta-negative'}>
                        {waitDelta > 0 ? '+' : ''}{waitDelta.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td>{s.kpi!.throughput_vph}</td>
                  <td>
                    {tputDelta === null ? (
                      <span className="ro-delta-neutral">baseline</span>
                    ) : (
                      <span className={tputDelta > 0 ? 'ro-delta-positive' : 'ro-delta-negative'}>
                        {tputDelta > 0 ? '+' : ''}{tputDelta.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td>{(s.kpi!.flow_efficiency * 100).toFixed(0)}%</td>
                  <td>{s.kpi!.episode_reward.toFixed(2)}</td>
                  <td style={{ color: '#64748b' }}>
                    {s.training_depth}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Charts */}
      <div className="ro-charts-row">
        {/* Throughput bar chart */}
        <div className="ro-chart-box">
          <div className="ro-chart-title">Throughput (vph)</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="throughput" radius={[4, 4, 0, 0]}>
                {barData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Avg Wait bar chart */}
        <div className="ro-chart-box">
          <div className="ro-chart-title">Avg Wait Time (s) — lower is better</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="wait" radius={[4, 4, 0, 0]}>
                {barData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Reward convergence line chart */}
      {lineData.length > 1 && (
        <div className="ro-chart-box" style={{ marginTop: 16 }}>
          <div className="ro-chart-title">RL Training Reward — Convergence per Scenario</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={lineData} margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
              <XAxis dataKey="episode" tick={{ fontSize: 10, fill: '#64748b' }} label={{ value: 'Episode', position: 'insideBottomRight', offset: -4, fontSize: 10, fill: '#475569' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10, color: '#94a3b8' }} />
              {done.map((s, i) => (
                <Line
                   key={s.scenario_id}
                   type="monotone"
                   dataKey={s.label}
                   stroke={CHART_COLORS[i % CHART_COLORS.length]}
                   strokeWidth={2}
                   dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trade-offs & Engineering Advice */}
      {mods.length > 0 && (
        <div style={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, marginTop: 16 }}>
          <div className="ro-card-title" style={{ color: '#94a3b8', marginBottom: 8 }}>Traffic Engineering Trade-offs</div>
          <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
            Optimizing road layouts often requires balancing **Wait Delays** vs **Throughput Limits**.
            For instance, adding a <em>Free Left Turn</em> decreases delay for left-turning vehicles but reduces main lane capacity if lane merging is congested.
            Similarly, a <em>Mid-Block U-Turn</em> removes U-turning vehicles from the main signal phases, increasing throughput, but requires sufficient mid-block roadway length to prevent weaving collisions.
            Evaluate these tradeoffs relative to peak-hour demand and refer to the <strong>AI Report</strong> tab for deep, GPT-4o powered feasibility and economic projections.
          </p>
        </div>
      )}
    </div>
  )
}
