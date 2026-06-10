import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

interface SessionSummary {
  session_id?: string
  notes?: string
  status: string
  total_episodes: number
}

interface PairCompareResult {
  session_a: { session_id: string; avg_wait_s: number; avg_throughput_vph: number; total_collisions: number; best_reward: number }
  session_b: { session_id: string; avg_wait_s: number; avg_throughput_vph: number; total_collisions: number; best_reward: number }
  winner: 'a' | 'b' | 'tie'
  deltas: { wait_s: number; throughput_vph: number; green_util: number; collisions: number }
  recommendation: string
}

interface MultiCompareRow {
  sim_id: string
  session_id: string
  created_at: string
  intersection: string
  total_vehicles: number
  duration_min: number
  throughput: number
  avg_wait: number
  p90_wait: number
  wait_std: number
  green_util_pct: number
  signal_efficiency_pct: number
  total_exited: number
  exit_rate: number
  total_collisions: number
  total_violations: number
  incident_rate_per_1k: number
  best_reward: number | null
  queue: Record<string, number>
  saturation: Record<string, number>
  avg_saturation: number
  queue_gini: number
  pressure_mean: number
  max_time_to_starvation_s: number
  trajectory_rows: number
  type_counts: Record<string, number>
  scores?: {
    efficiency: number
    safety: number
    stability: number
  }
}

function buildDummyMultiCompare(ids: string[]): MultiCompareRow[] {
  const base = ids.length >= 2 ? ids : ['135', '134', '133', '132']
  const profiles = [
    { throughput: 610, avgWait: 64.0, collisions: 2, violations: 7, exited: 900, demand: 1200, green: 72, signal: 67, reward: 245.1, eff: 68, safe: 52, stable: 60 },
    { throughput: 670, avgWait: 56.0, collisions: 1, violations: 4, exited: 1020, demand: 1280, green: 77, signal: 73, reward: 281.7, eff: 74, safe: 70, stable: 69 },
    { throughput: 720, avgWait: 49.9, collisions: 0, violations: 1, exited: 1130, demand: 1360, green: 82, signal: 80, reward: 312.4, eff: 82, safe: 96, stable: 78 },
    { throughput: 695, avgWait: 53.5, collisions: 0, violations: 2, exited: 1090, demand: 1320, green: 79, signal: 76, reward: 298.2, eff: 79, safe: 90, stable: 75 },
    { throughput: 682, avgWait: 55.1, collisions: 1, violations: 3, exited: 1058, demand: 1300, green: 78, signal: 74, reward: 287.9, eff: 76, safe: 82, stable: 72 },
    { throughput: 705, avgWait: 52.8, collisions: 0, violations: 2, exited: 1110, demand: 1340, green: 80, signal: 78, reward: 301.3, eff: 80, safe: 90, stable: 76 },
  ]

  return base.slice(0, 6).map((id, idx) => {
    const p = profiles[idx % profiles.length]
    const throughput = p.throughput
    const avgWait = p.avgWait
    const collisions = p.collisions
    const violations = p.violations
    const exited = p.exited
    const durationMin = 60
    const demand = p.demand
    const typeCounts = {
      bike: 220 + idx * 24,
      car: 330 + idx * 28,
      auto: 130 + idx * 10,
      bus: 45 + idx * 4,
      truck: 28 + idx * 3,
    }

    return {
      sim_id: id,
      session_id: id,
      created_at: new Date(Date.now() - idx * 86400000).toISOString(),
      intersection: '4way_cross',
      total_vehicles: demand,
      duration_min: durationMin,
      throughput,
      avg_wait: avgWait,
      p90_wait: avgWait + 16.5,
      wait_std: Math.max(4.4, 9.5 - idx * 1.1),
      green_util_pct: p.green,
      signal_efficiency_pct: p.signal,
      total_exited: exited,
      exit_rate: Math.min(99, (exited / demand) * 100),
      total_collisions: collisions,
      total_violations: Math.max(0, violations),
      incident_rate_per_1k: Number((((collisions + Math.max(0, violations)) * 1000) / exited).toFixed(2)),
      best_reward: p.reward,
      queue: { N: 10 - idx, S: 9 - idx, E: 8 - idx, W: 7 - idx },
      saturation: { N: 0.78 - idx * 0.04, S: 0.75 - idx * 0.04, E: 0.7 - idx * 0.03, W: 0.68 - idx * 0.03 },
      avg_saturation: Number((0.73 - idx * 0.035).toFixed(3)),
      queue_gini: Number((0.24 - idx * 0.03).toFixed(3)),
      pressure_mean: Number((2.2 - idx * 0.5).toFixed(2)),
      max_time_to_starvation_s: 95 - idx * 12,
      trajectory_rows: 120,
      type_counts: typeCounts,
      scores: {
        efficiency: p.eff,
        safety: p.safe,
        stability: p.stable,
      },
    }
  })
}

function getSessionId(session: SessionSummary): string {
  return session.session_id || session.notes || ''
}

function parseIds(raw: string): string[] {
  const ids = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  return Array.from(new Set(ids))
}

function formatNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '-'
}

function buildDummyPair(sessionA: string, sessionB: string): PairCompareResult {
  return {
    session_a: { session_id: sessionA || 'A', avg_wait_s: 64.0, avg_throughput_vph: 610, total_collisions: 2, best_reward: 245.1 },
    session_b: { session_id: sessionB || 'B', avg_wait_s: 49.9, avg_throughput_vph: 720, total_collisions: 0, best_reward: 312.4 },
    winner: 'b',
    deltas: { wait_s: 14.1, throughput_vph: 110, green_util: 0.1, collisions: 2 },
    recommendation: 'Demo story: Session B achieves 22% lower wait, 18% higher throughput, and zero collisions versus baseline.',
  }
}

export default function CompareSession() {
  const [search] = useSearchParams()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [sessionA, setSessionA] = useState(search.get('session_a') || '')
  const [sessionB, setSessionB] = useState(search.get('session_b') || '')
  const [pairResult, setPairResult] = useState<PairCompareResult | null>(null)
  const [multiResult, setMultiResult] = useState<MultiCompareRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [usingDemoData, setUsingDemoData] = useState(false)

  const idsFromQuery = useMemo(() => parseIds(search.get('ids') || ''), [search])
  const isMultiMode = idsFromQuery.length >= 2

  const comparePair = async () => {
    if (!sessionA || !sessionB) {
      setError('Select both sessions')
      return
    }

    setLoading(true)
    setError('')
    setMultiResult(null)
    setUsingDemoData(false)

    try {
      const res = await fetch(
        `/api/compare?session_a=${encodeURIComponent(sessionA)}&session_b=${encodeURIComponent(sessionB)}`
      ).then((r) => r.json())

      if (res.success) {
        setPairResult(res.data as PairCompareResult)
      } else {
        setPairResult(buildDummyPair(sessionA, sessionB))
        setUsingDemoData(true)
      }
    } catch {
      setPairResult(buildDummyPair(sessionA, sessionB))
      setUsingDemoData(true)
    } finally {
      setLoading(false)
    }
  }

  const compareMulti = async (ids: string[]) => {
    if (ids.length < 2) {
      setError('At least two sessions are required')
      return
    }

    setLoading(true)
    setError('')
    setPairResult(null)
    setUsingDemoData(false)

    try {
      const data = (await fetch(`/api/compare?ids=${encodeURIComponent(ids.join(','))}`).then((r) => r.json())) as MultiCompareRow[]
      if (Array.isArray(data) && data.length > 0) {
        setMultiResult(data)
      } else {
        setMultiResult(buildDummyMultiCompare(ids))
        setUsingDemoData(true)
      }
    } catch {
      setMultiResult(buildDummyMultiCompare(ids))
      setUsingDemoData(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setSessions(res.data)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isMultiMode) {
      void compareMulti(idsFromQuery)
      return
    }
    if (sessionA && sessionB) {
      void comparePair()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chartData = useMemo(() => {
    if (!multiResult) return []
    return multiResult.map((row) => ({
      name: `#${row.sim_id.slice(0, 8)}`,
      throughput: row.throughput,
      wait: row.avg_wait,
      incidentRate: row.incident_rate_per_1k,
      efficiency: row.scores?.efficiency ?? 0,
      safety: row.scores?.safety ?? 0,
      stability: row.scores?.stability ?? 0,
    }))
  }, [multiResult])

  const vehicleTypes = useMemo(() => {
    if (!multiResult?.length) return ['car', 'bike', 'auto', 'bus', 'truck']
    const keys = new Set<string>()
    for (const row of multiResult) {
      Object.keys(row.type_counts || {}).forEach((k) => keys.add(k))
    }
    const values = Array.from(keys)
    return values.length ? values : ['car', 'bike', 'auto', 'bus', 'truck']
  }, [multiResult])

  const tableMetrics = useMemo(() => {
    if (!multiResult) return []
    return [
      {
        label: 'Throughput',
        unit: 'v/h',
        better: 'max' as const,
        values: multiResult.map((r) => Math.round(r.throughput)),
      },
      {
        label: 'Average Wait',
        unit: 's',
        better: 'min' as const,
        values: multiResult.map((r) => r.avg_wait),
      },
      {
        label: 'P90 Wait',
        unit: 's',
        better: 'min' as const,
        values: multiResult.map((r) => r.p90_wait),
      },
      {
        label: 'Exit Rate',
        unit: '%',
        better: 'max' as const,
        values: multiResult.map((r) => r.exit_rate),
      },
      {
        label: 'Green Utilization',
        unit: '%',
        better: 'max' as const,
        values: multiResult.map((r) => r.green_util_pct),
      },
      {
        label: 'Signal Efficiency',
        unit: '%',
        better: 'max' as const,
        values: multiResult.map((r) => r.signal_efficiency_pct),
      },
      {
        label: 'Incident Rate',
        unit: '/1k',
        better: 'min' as const,
        values: multiResult.map((r) => r.incident_rate_per_1k),
      },
      {
        label: 'Client Score',
        unit: '',
        better: 'max' as const,
        values: multiResult.map((r) => r.scores?.efficiency ?? 0),
      },
    ]
  }, [multiResult])

  return (
    <div className="app-page">
      <div className="app-container space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/simulations" className="text-slate-400 hover:text-cyan-300 text-sm">Back to Simulations</Link>
          <h1 className="app-title">Comparison</h1>
        </div>

        {!isMultiMode && (
          <div className="app-panel p-4 flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Session A</label>
                <select
                  className="app-input w-full text-sm"
                  value={sessionA}
                  onChange={(e) => setSessionA(e.target.value)}
                >
                  <option value="">Select session</option>
                  {sessions.map((s) => {
                    const sid = getSessionId(s)
                    return (
                      <option key={sid} value={sid}>
                        {sid.slice(0, 18)}... ({s.status}, {s.total_episodes} eps)
                      </option>
                    )
                  })}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Session B</label>
                <select
                  className="app-input w-full text-sm"
                  value={sessionB}
                  onChange={(e) => setSessionB(e.target.value)}
                >
                  <option value="">Select session</option>
                  {sessions.map((s) => {
                    const sid = getSessionId(s)
                    return (
                      <option key={sid} value={sid}>
                        {sid.slice(0, 18)}... ({s.status}, {s.total_episodes} eps)
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>

            <button
              className="app-btn-primary text-sm disabled:opacity-50"
              onClick={comparePair}
              disabled={loading}
            >
              {loading ? 'Comparing...' : 'Compare Sessions'}
            </button>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {usingDemoData && (
          <div className="text-amber-300 text-xs bg-amber-950/30 border border-amber-700/40 rounded-lg px-3 py-2 space-y-1">
            <p>Demo data mode enabled: database/API is unavailable, so curated sample comparison metrics are shown.</p>
            <p className="text-amber-200">Client narrative: 22% lower wait, 18% higher throughput, and zero collisions in the best plan.</p>
          </div>
        )}

        {pairResult && (
          <div className="app-panel p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(['a', 'b'] as const).map((side) => {
                const data = pairResult[`session_${side}`]
                const isWinner = pairResult.winner === side
                return (
                  <div key={side} className={`rounded-lg p-4 border ${isWinner ? 'border-emerald-500/50 bg-emerald-900/10' : 'border-gray-700 bg-gray-800'}`}>
                    <h3 className={`text-sm font-bold mb-3 ${isWinner ? 'text-emerald-400' : 'text-gray-400'}`}>
                      Session {side.toUpperCase()} {isWinner ? 'Winner' : ''}
                    </h3>
                    <div className="space-y-1 text-sm font-mono">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Avg Wait</span>
                        <span className="text-gray-200">{data.avg_wait_s?.toFixed(1) ?? '-'}s</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Throughput</span>
                        <span className="text-gray-200">{data.avg_throughput_vph?.toFixed(0) ?? '-'} vph</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Collisions</span>
                        <span className={data.total_collisions === 0 ? 'text-emerald-400' : 'text-red-400'}>{data.total_collisions ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Best Reward</span>
                        <span className="text-gray-200">{data.best_reward?.toFixed(1) ?? '-'}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Recommendation</p>
              <p className="text-sm text-gray-200">{pairResult.recommendation}</p>
            </div>
          </div>
        )}

        {multiResult && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {multiResult.map((row) => (
                <div key={row.sim_id} className="app-panel p-4 space-y-2">
                  <p className="text-[11px] text-gray-500">{new Date(row.created_at).toLocaleString()}</p>
                  <p className="text-base font-bold text-white font-mono">#{row.sim_id}</p>
                  <p className="text-[11px] text-gray-500">{row.intersection} | {row.duration_min}m | demand {row.total_vehicles.toLocaleString()}</p>
                  <div className="space-y-1 text-xs font-mono pt-1">
                    <div className="flex justify-between"><span className="text-gray-500">Throughput</span><span className="text-gray-200">{Math.round(row.throughput)} v/h</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Avg wait</span><span className="text-gray-200">{formatNumber(row.avg_wait)}s</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Exit rate</span><span className="text-gray-200">{formatNumber(row.exit_rate)}%</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Incident /1k</span><span className="text-gray-200">{formatNumber(row.incident_rate_per_1k, 2)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Client score</span><span className="text-cyan-300">{formatNumber(row.scores?.efficiency ?? 0)}</span></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="app-panel p-4 overflow-x-auto">
              <h3 className="text-sm font-semibold text-white mb-3">Key Metrics</h3>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 pr-4">Metric</th>
                    {multiResult.map((row) => (
                      <th key={row.sim_id} className="text-right py-2 px-2 text-cyan-300">#{row.sim_id.slice(0, 8)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableMetrics.map((metric) => {
                    const target = metric.better === 'max' ? Math.max(...metric.values) : Math.min(...metric.values)
                    return (
                      <tr key={metric.label} className="border-b border-gray-800">
                        <td className="py-2 pr-4 text-gray-400">{metric.label}</td>
                        {metric.values.map((v, i) => (
                          <td
                            key={`${metric.label}-${i}`}
                            className={`py-2 px-2 text-right font-mono ${v === target ? 'text-emerald-400 font-bold' : 'text-gray-100'}`}
                          >
                            {formatNumber(v, metric.unit === '/1k' ? 2 : 1)}{metric.unit}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="app-panel p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Throughput vs Wait</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="throughput" fill="#22d3ee" name="Throughput (v/h)" />
                      <Bar yAxisId="right" dataKey="wait" fill="#f59e0b" name="Avg wait (s)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="app-panel p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Executive Scores</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="name" stroke="#9ca3af" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="efficiency" fill="#34d399" name="Efficiency" />
                      <Bar dataKey="safety" fill="#60a5fa" name="Safety" />
                      <Bar dataKey="stability" fill="#a78bfa" name="Stability" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="app-panel p-4 overflow-x-auto">
              <h3 className="text-sm font-semibold text-white mb-3">Vehicle Type Breakdown</h3>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 pr-4">Type</th>
                    {multiResult.map((row) => (
                      <th key={row.sim_id} className="text-right py-2 px-2 text-cyan-300">#{row.sim_id.slice(0, 8)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vehicleTypes.map((type) => (
                    <tr key={type} className="border-b border-gray-800">
                      <td className="py-2 pr-4 text-gray-400 capitalize">{type}</td>
                      {multiResult.map((row) => {
                        const count = row.type_counts?.[type] || 0
                        return (
                          <td key={`${row.sim_id}-${type}`} className="py-2 px-2 text-right text-gray-100 font-mono">
                            {count.toLocaleString()}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
