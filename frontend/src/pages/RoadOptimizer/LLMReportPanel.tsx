import React, { useState, useEffect } from 'react'
import type { Scenario, LLMRecommendation, LLMRankedScenario } from './types'

const API = '/api/optimizer'

interface Props {
  scenarios: Scenario[]
  intersectionName: string
  autoRequest?: boolean
  onReportComplete?: () => void
}

const FEASIBILITY_COLORS: Record<string, string> = {
  'Easy': 'ro-feasibility-Easy',
  'Moderate': 'ro-feasibility-Moderate',
  'Complex': 'ro-feasibility-Complex',
  'Not Recommended': 'ro-feasibility-Not',
}

const STRENGTH_COLORS: Record<string, string> = {
  'Strongly Recommended': '#10b981',
  'Recommended': '#fbbf24',
  'Neutral': '#94a3b8',
  'Not Recommended': '#ef4444',
}

function RankBadge({ rank }: { rank: number }) {
  const cls = rank === 1 ? 'ro-rank-1' : rank === 2 ? 'ro-rank-2' : rank === 3 ? 'ro-rank-3' : 'ro-rank-n'
  return <div className={`ro-rank-badge ${cls}`}>#{rank}</div>
}

export default function LLMReportPanel({
  scenarios,
  intersectionName,
  autoRequest = false,
  onReportComplete,
}: Props) {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<LLMRecommendation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('claude-3-haiku-20240307')

  const doneScenarios = scenarios.filter(s => s.status === 'done' && s.kpi)
  const canRequest = doneScenarios.length >= 1

  const handleGetRecommendation = async () => {
    setLoading(true)
    setError(null)

    const payload = {
      intersection_name: intersectionName,
      model: selectedModel,
      scenarios: doneScenarios.map(s => ({
        scenario_id: s.scenario_id,
        label: s.label,
        scenario_type: s.scenario_type,
        training_depth: s.training_depth,
        kpi: s.kpi,
      })),
    }

    try {
      const res = await fetch(`${API}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data: LLMRecommendation = await res.json()
      setReport(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to get recommendation')
    } finally {
      setLoading(false)
      if (onReportComplete) {
        onReportComplete()
      }
    }
  }

  // E2E Demo Auto-request effect
  useEffect(() => {
    if (autoRequest && canRequest && !report && !loading) {
      handleGetRecommendation()
    }
  }, [autoRequest, canRequest, report, loading, selectedModel])

  return (
    <div className="ro-llm-area animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 16, flexWrap: 'wrap' }}>
        <div className="ro-section-header" style={{ margin: 0 }}>
          AI Recommendation
          <span className="ro-section-chip" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', marginLeft: 12 }}>
            {selectedModel === 'gpt-4o' ? 'GPT-4o' :
             selectedModel === 'gpt-4-turbo' ? 'GPT-4 Turbo' :
             selectedModel.startsWith('claude-3-5') ? 'Claude 3.5 Sonnet' :
             selectedModel.startsWith('claude-3') ? 'Claude 3 Haiku' :
             selectedModel.includes('70b') ? 'Llama 3 70B' : 'Mixtral 8x7B'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Model Selector */}
          <div className="ro-model-select-wrapper">
            <span className="ro-model-select-label">Model:</span>
            <select
              className="ro-model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={loading}
            >
              <optgroup label="OpenAI">
                <option value="gpt-4o">GPT-4o (Default)</option>
                <option value="gpt-4-turbo">GPT-4 Turbo</option>
              </optgroup>
              <optgroup label="Anthropic / Claude">
                <option value="claude-3-5-sonnet-20240620">Claude 3.5 Sonnet</option>
                <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
              </optgroup>
              <optgroup label="Groq Llama / Mixtral">
                <option value="llama3-70b-8192">Llama 3 70B</option>
                <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
              </optgroup>
            </select>
          </div>

          <button
            id="ro-get-recommendation-btn"
            className="premium-ai-btn"
            onClick={handleGetRecommendation}
            disabled={!canRequest || loading}
          >
            {loading ? (
              <>
                <div className="ro-spinner" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff', width: 12, height: 12 }} />
                Analyzing…
              </>
            ) : (
              report ? 'Refresh Report' : 'Get AI Recommendation'
            )}
          </button>
        </div>
      </div>

      {/* Insufficient data hint */}
      {!canRequest && (
        <div className="ro-empty">
          <div className="ro-empty-text">
            Complete at least 1 scenario to generate an AI recommendation.
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#f87171', marginBottom: 16 }}>
          Error: {error}
        </div>
      )}

      {/* API key warning */}
      {report?.key_missing && (
        <div className="ro-warning" style={{ marginBottom: 16 }}>
          <span>Warning: </span>
          <div>
            <strong>Missing API Configuration.</strong> Showing heuristic analysis fallback.
            <div style={{ marginTop: 4, fontSize: 11.5, opacity: 0.9 }}>
              {error || report.error || 'Please configure the corresponding API key in your .env file.'}
            </div>
          </div>
        </div>
      )}

      {/* Report */}
      {report?.data && (
        <>
          {/* Executive Summary */}
          <div className="ro-llm-banner">
            <div style={{ fontSize: 11, color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {report.data.llm_used === false ? 'Heuristic Analysis' : 'AI Analysis'} · {report.data.intersection}
            </div>
            <p className="ro-llm-summary">{report.data.summary}</p>
          </div>

          {/* Top Recommendation callout */}
          {report.data.top_recommendation && (
            <div className="ro-top-rec-card" style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Top Recommendation
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
                {report.data.top_recommendation.label}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                {report.data.top_recommendation.reason}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#34d399', fontWeight: 600 }}>
                Estimated benefit: {report.data.top_recommendation.estimated_benefit}
              </div>
            </div>
          )}

          {/* Best Cost-Benefit */}
          {report.data.best_cost_benefit && (
            <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Best Cost-Benefit
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fbbf24' }}>{report.data.best_cost_benefit.label}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{report.data.best_cost_benefit.reason}</div>
            </div>
          )}

          {/* Ranked scenarios */}
          {report.data.ranked_scenarios?.length > 0 && (
            <>
              <div className="ro-card-title" style={{ marginBottom: 12 }}>Scenario Analysis</div>
              <div className="ro-ranked-list">
                {report.data.ranked_scenarios.map((item: LLMRankedScenario) => (
                  <div key={item.scenario_id} className="ro-ranked-item">
                    <div className="ro-ranked-header">
                      <RankBadge rank={item.rank} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                          <span style={{ color: STRENGTH_COLORS[item.recommendation_strength] || '#94a3b8', marginRight: 6 }}>●</span>
                          {item.label}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{item.headline}</div>
                      </div>
                      {item.feasibility && (
                        <span className={`ro-feasibility-badge ${FEASIBILITY_COLORS[item.feasibility] || 'ro-feasibility-Moderate'}`}>
                          {item.feasibility}
                        </span>
                      )}
                    </div>

                    <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: '8px 0' }}>
                      {item.analysis}
                    </p>

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                      {item.vs_baseline_wait_pct !== undefined && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          Wait Δ: <span className={item.vs_baseline_wait_pct < 0 ? 'ro-delta-positive' : 'ro-delta-negative'}>
                            {item.vs_baseline_wait_pct > 0 ? '+' : ''}{item.vs_baseline_wait_pct?.toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {item.vs_baseline_throughput_pct !== undefined && (
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          Throughput Δ: <span className={item.vs_baseline_throughput_pct > 0 ? 'ro-delta-positive' : 'ro-delta-negative'}>
                            {item.vs_baseline_throughput_pct > 0 ? '+' : ''}{item.vs_baseline_throughput_pct?.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>

                    {item.implementation_notes && (
                      <div style={{ fontSize: 11, color: '#475569', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
                        Notes: {item.implementation_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Caveats */}
          {report.data.caveats?.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="ro-card-title" style={{ marginBottom: 8 }}>Caveats</div>
              <ul className="ro-caveat-list">
                {report.data.caveats.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
