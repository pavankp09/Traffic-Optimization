import React, { useState, useEffect } from 'react'
import type { Scenario, LLMRecommendation, LLMRankedScenario } from './types'

const API = '/api/optimizer'

interface Props {
  scenarios: Scenario[]
  intersectionName: string
  autoRequest?: boolean
  onReportComplete?: () => void
  persistedReport?: LLMRecommendation | null
  onReportFetched?: (report: LLMRecommendation) => void
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
  persistedReport,
  onReportFetched,
}: Props) {
  const [loading, setLoading] = useState(false)
  // Initialize from persisted report so tab switching doesn't lose the result
  const [report, setReport] = useState<LLMRecommendation | null>(persistedReport ?? null)
  const [error, setError] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('claude-haiku-4-5')
  const [expandedScenarios, setExpandedScenarios] = useState<Record<string, boolean>>({})

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
      // Notify parent to persist this report across tab switches
      if (onReportFetched) onReportFetched(data)
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
             selectedModel === 'claude-fable-5' ? 'Claude Fable 5' :
             selectedModel === 'claude-sonnet-4-6' ? 'Claude Sonnet 4.6' :
             selectedModel === 'claude-haiku-4-5' ? 'Claude Haiku 4.5' :
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
              <optgroup label="Anthropic / Claude (via Bedrock)">
                <option value="claude-haiku-4-5">Claude Haiku 4.5 ✦ Fast &amp; Default</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6 ✦ High Quality</option>
                <option value="claude-fable-5">Claude Fable 5 ✦ Premium</option>
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
            ) : report ? (
              <>
                <span style={{ color: '#34d399', marginRight: 5, fontSize: 14, fontWeight: 700 }}>&#10003;</span>
                Refresh Report
              </>
            ) : (
              'Get AI Recommendation'
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

      {/* Fallback / Configuration Warning */}
      {(report?.key_missing || report?.error) && (
        <div className="ro-warning" style={{ marginBottom: 16 }}>
          <span>Warning: </span>
          <div>
            <strong>AI Recommendation Unavailable.</strong> Showing heuristic analysis fallback.
            <div style={{ marginTop: 4, fontSize: 11.5, opacity: 0.9 }}>
              {report?.error || error || 'Please configure the corresponding API key in your .env file.'}
            </div>
          </div>
        </div>
      )}

      {/* Report */}
      {report?.data && (
        <>
          {/* Executive Summary & Main Dashboard Cards */}
          {(() => {
            const topScenario = report.data.ranked_scenarios?.find(
              (s: any) => s.label.toLowerCase() === report.data.top_recommendation.label.toLowerCase() ||
                          report.data.top_recommendation.label.toLowerCase().includes(s.label.toLowerCase()) ||
                          s.label.toLowerCase().includes(report.data.top_recommendation.label.toLowerCase())
            );
            const costBenefitScenario = report.data.ranked_scenarios?.find(
              (s: any) => s.label.toLowerCase() === report.data.best_cost_benefit.label.toLowerCase() ||
                          report.data.best_cost_benefit.label.toLowerCase().includes(s.label.toLowerCase()) ||
                          s.label.toLowerCase().includes(report.data.best_cost_benefit.label.toLowerCase())
            );

            return (
              <div className="ro-rec-dashboard">
                {/* Left Column: Top Pick */}
                <div className="ro-rec-card ro-rec-card-hero">
                  <div className="ro-rec-badge ro-rec-badge-hero">
                    ★ Top Recommendation
                  </div>
                  <div className="ro-rec-title">
                    {report.data.top_recommendation.label}
                  </div>
                  
                  {topScenario && (
                    <div className="ro-rec-metric-grid">
                      <div className="ro-rec-metric-item">
                        <span className="ro-rec-metric-value" style={{ color: '#34d399' }}>
                          {topScenario.vs_baseline_wait_pct !== undefined ? (
                            `${topScenario.vs_baseline_wait_pct > 0 ? '+' : ''}${topScenario.vs_baseline_wait_pct.toFixed(1)}%`
                          ) : 'N/A'}
                        </span>
                        <span className="ro-rec-metric-label">Delay Δ</span>
                      </div>
                      <div className="ro-rec-metric-item">
                        <span className="ro-rec-metric-value" style={{ color: '#34d399' }}>
                          {topScenario.vs_baseline_throughput_pct !== undefined ? (
                            `${topScenario.vs_baseline_throughput_pct > 0 ? '+' : ''}${topScenario.vs_baseline_throughput_pct.toFixed(1)}%`
                          ) : 'N/A'}
                        </span>
                        <span className="ro-rec-metric-label">Flow Δ</span>
                      </div>
                      <div className="ro-rec-metric-item">
                        <span className="ro-rec-metric-value" style={{ color: '#fbbf24' }}>
                          {topScenario.feasibility || 'Moderate'}
                        </span>
                        <span className="ro-rec-metric-label">Feasibility</span>
                      </div>
                    </div>
                  )}

                  <div className="ro-rec-text">
                    {report.data.top_recommendation.reason}
                  </div>

                  {report.data.top_recommendation.estimated_benefit && (
                    <div className="ro-rec-benefit-box">
                      <strong>Expected Benefit:</strong> {report.data.top_recommendation.estimated_benefit}
                    </div>
                  )}
                </div>

                {/* Right Column: Cost-Benefit Winner & Exec Summary */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {report.data.best_cost_benefit && (
                    <div className="ro-rec-card ro-rec-card-cost" style={{ flex: 1 }}>
                      <div className="ro-rec-badge ro-rec-badge-cost">
                        $ Best Cost-Benefit
                      </div>
                      <div className="ro-rec-title" style={{ fontSize: 16 }}>
                        {report.data.best_cost_benefit.label}
                      </div>
                      
                      {costBenefitScenario && (
                        <div className="ro-rec-metric-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', padding: 8, marginBottom: 10 }}>
                          <div className="ro-rec-metric-item">
                            <span className="ro-rec-metric-value" style={{ color: '#34d399', fontSize: 12 }}>
                              {costBenefitScenario.vs_baseline_wait_pct !== undefined ? (
                                `${costBenefitScenario.vs_baseline_wait_pct > 0 ? '+' : ''}${costBenefitScenario.vs_baseline_wait_pct.toFixed(1)}%`
                              ) : 'N/A'}
                            </span>
                            <span className="ro-rec-metric-label" style={{ fontSize: 8 }}>Delay Δ</span>
                          </div>
                          <div className="ro-rec-metric-item">
                            <span className="ro-rec-metric-value" style={{ color: '#34d399', fontSize: 12 }}>
                              {costBenefitScenario.vs_baseline_throughput_pct !== undefined ? (
                                `${costBenefitScenario.vs_baseline_throughput_pct > 0 ? '+' : ''}${costBenefitScenario.vs_baseline_throughput_pct.toFixed(1)}%`
                              ) : 'N/A'}
                            </span>
                            <span className="ro-rec-metric-label" style={{ fontSize: 8 }}>Flow Δ</span>
                          </div>
                        </div>
                      )}

                      <div className="ro-rec-text" style={{ margin: 0, fontSize: 11.5 }}>
                        {report.data.best_cost_benefit.reason}
                      </div>
                    </div>
                  )}

                  {/* Executive Insights Block */}
                  <div className="ro-rec-card" style={{ padding: 16 }}>
                    <div className="ro-rec-summary-tag">
                      ✦ AI Executive Insights
                    </div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8', lineHeight: 1.6, fontStyle: 'italic' }}>
                      "{report.data.summary}"
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Ranked scenarios */}
          {report.data.ranked_scenarios?.length > 0 && (
            <>
              <div className="ro-card-title" style={{ marginBottom: 12 }}>Scenario Analysis</div>
              <div className="ro-ranked-list">
                {report.data.ranked_scenarios.map((item: LLMRankedScenario) => {
                  const isExpanded = expandedScenarios[item.scenario_id] ?? false;
                  return (
                    <div key={item.scenario_id} className="ro-ranked-item">
                      <div 
                        className="ro-ranked-header"
                        onClick={() => setExpandedScenarios(prev => ({ ...prev, [item.scenario_id]: !isExpanded }))}
                        style={{ cursor: 'pointer', userSelect: 'none', marginBottom: isExpanded ? 8 : 0 }}
                      >
                        <RankBadge rank={item.rank} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                            <span style={{ color: STRENGTH_COLORS[item.recommendation_strength] || '#94a3b8', marginRight: 6 }}>●</span>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{item.headline}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {item.feasibility && (
                            <span className={`ro-feasibility-badge ${FEASIBILITY_COLORS[item.feasibility] || 'ro-feasibility-Moderate'}`}>
                              {item.feasibility}
                            </span>
                          )}
                          <div style={{ 
                            color: '#64748b', 
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', 
                            transition: 'transform 0.2s ease', 
                            display: 'flex', 
                            alignItems: 'center' 
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="animate-fadeIn" style={{ marginTop: 10 }}>
                          <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6, margin: '8px 0 12px 0' }}>
                            {item.analysis}
                          </p>

                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
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
                            <div style={{ fontSize: 11, color: '#475569', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 10 }}>
                              <strong>Notes: </strong>{item.implementation_notes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
