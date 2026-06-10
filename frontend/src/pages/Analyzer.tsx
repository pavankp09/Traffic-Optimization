import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

type Arm = 'N' | 'S' | 'E' | 'W'

interface AnalyzerStatus {
  sim_status: string
  sim_time: number
  sim_duration_min: number
  active: number
  exited: number
  avg_wait: number
  throughput: number
  queue: Record<Arm, number>
  lights: Record<Arm, 'red' | 'yellow' | 'green' | 'off'>
  queue_history: Array<{ t: number; N: number; S: number; E: number; W: number }>
  type_dist: Record<string, number>
}

interface ReportPayload {
  total_exited: number
  avg_wait_sec: number
  throughput_vph: number
  bottleneck_arm: string
  arm_avg_queue: Record<Arm, number>
  recommendations: string[]
  signal_waste_phases: Array<{ t: number; arm: string }>
}

interface CalcPayload {
  saturation: Record<Arm, number>
  gini: number
  pressure_mean: number
  discharge_rate: Record<Arm, number>
  time_to_starvation: Record<Arm, number>
  trajectory_rows: number
}

const POLL_INTERVALS = [2000, 5000, 10000, 15000]
const TYPE_COLORS = ['#22d3ee', '#34d399', '#f59e0b', '#a78bfa', '#f472b6', '#f87171', '#94a3b8']

function buildDemoStatus(simLabel: string): AnalyzerStatus {
  const history = Array.from({ length: 24 }, (_, i) => {
    const base = 10 + Math.sin(i / 3) * 2.4
    return {
      t: i * 5,
      N: Math.max(1, Math.round(base + (i % 4) - 2)),
      S: Math.max(1, Math.round(base - (i % 4) + 1)),
      E: Math.max(1, Math.round(base - 3 + ((i + 2) % 3))),
      W: Math.max(1, Math.round(base - 4 + (i % 2))),
    }
  })

  return {
    sim_status: 'demo',
    sim_time: 120,
    sim_duration_min: 60,
    active: 132,
    exited: 1130,
    avg_wait: 49.9,
    throughput: 720,
    queue: { N: 8, S: 7, E: 5, W: 4 },
    lights: { N: 'green', S: 'red', E: 'red', W: 'yellow' },
    queue_history: history,
    type_dist: {
      bike: 338,
      car: 452,
      auto: 168,
      bus: 102,
      truck: 70,
    },
  }
}

const DEMO_REPORT: ReportPayload = {
  total_exited: 1130,
  avg_wait_sec: 49.9,
  throughput_vph: 720,
  bottleneck_arm: 'N',
  arm_avg_queue: { N: 8, S: 7, E: 5, W: 4 },
  recommendations: [
    'Demonstrated 22% wait-time reduction against baseline by adaptive phase extension.',
    'Demonstrated 18% throughput uplift by queue-weighted split optimization.',
    'Sustained zero-collision operation with conflict-aware turning release policy.',
  ],
  signal_waste_phases: [
    { t: 42, arm: 'EW' },
    { t: 88, arm: 'NS' },
  ],
}

const DEMO_CALC: CalcPayload = {
  saturation: { N: 0.84, S: 0.78, E: 0.64, W: 0.58 },
  gini: 0.218,
  pressure_mean: 1.7,
  discharge_rate: { N: 0.55, S: 0.57, E: 0.66, W: 0.71 },
  time_to_starvation: { N: 14.6, S: 12.3, E: 7.8, W: 6.5 },
  trajectory_rows: 1960,
}

export default function Analyzer() {
  const [search] = useSearchParams()
  const initialSession = search.get('session') || ''
  const [sessionId, setSessionId] = useState(initialSession)
  const [pollIdx, setPollIdx] = useState(0)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<AnalyzerStatus>(buildDemoStatus(initialSession || 'demo'))
  const [report, setReport] = useState<ReportPayload>(DEMO_REPORT)
  const [calc, setCalc] = useState<CalcPayload>(DEMO_CALC)
  const [error, setError] = useState('')
  const [usingDemo, setUsingDemo] = useState(true)

  const typeData = useMemo(() => {
    if (!status?.type_dist) return []
    return Object.entries(status.type_dist).map(([name, value]) => ({ name, value }))
  }, [status])

  useEffect(() => {
    if (!initialSession) return
    void pollOnce(initialSession)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSession])

  useEffect(() => {
    if (!running || !sessionId) return
    const handle = window.setInterval(() => {
      void pollOnce(sessionId)
    }, POLL_INTERVALS[pollIdx])
    return () => window.clearInterval(handle)
  }, [running, pollIdx, sessionId])

  const applyDemo = (sid: string) => {
    setStatus(buildDemoStatus(sid))
    setReport(DEMO_REPORT)
    setCalc(DEMO_CALC)
    setUsingDemo(true)
  }

  const pollOnce = async (sid: string) => {
    try {
      const res = await fetch(`/api/status/${encodeURIComponent(sid)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as AnalyzerStatus
      if ((data as unknown as { error?: string }).error) {
        throw new Error((data as unknown as { error: string }).error)
      }
      setStatus(data)
      setUsingDemo(false)
      setError('')
      if (data.sim_status === 'done') {
        setRunning(false)
      }
    } catch {
      applyDemo(sid)
      setError('Live API unavailable. Showing demo data.')
      setRunning(false)
    }
  }

  const start = async () => {
    const sid = sessionId.trim()
    if (!sid) {
      applyDemo('demo')
      setError('No session selected. Showing demo data.')
      return
    }
    setRunning(true)
    await pollOnce(sid)
  }

  const loadReport = async () => {
    const sid = sessionId.trim()
    if (!sid) {
      setReport(DEMO_REPORT)
      setUsingDemo(true)
      return
    }
    try {
      const res = await fetch(`/api/report/${encodeURIComponent(sid)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setReport((await res.json()) as ReportPayload)
      setUsingDemo(false)
      setError('')
    } catch {
      setReport(DEMO_REPORT)
      setUsingDemo(true)
      setError('Report API unavailable. Showing demo report.')
    }
  }

  const showDebug = async () => {
    const sid = sessionId.trim()
    if (!sid) {
      const win = window.open('', '_blank', 'width=820,height=620')
      if (win) {
        win.document.write(
          `<pre style="background:#0a0a0a;color:#e5e7eb;padding:16px;font-size:12px">${JSON.stringify({ demo: true, status, report, calc }, null, 2)}</pre>`
        )
        win.document.close()
      }
      return
    }
    try {
      const res = await fetch(`/api/debug/${encodeURIComponent(sid)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const win = window.open('', '_blank', 'width=820,height=620')
      if (win) {
        win.document.write(
          `<pre style="background:#0a0a0a;color:#e5e7eb;padding:16px;font-size:12px">${JSON.stringify(data, null, 2)}</pre>`
        )
        win.document.close()
      }
    } catch {
      const win = window.open('', '_blank', 'width=820,height=620')
      if (win) {
        win.document.write(
          `<pre style="background:#0a0a0a;color:#e5e7eb;padding:16px;font-size:12px">${JSON.stringify({ demo: true, status, report, calc }, null, 2)}</pre>`
        )
        win.document.close()
      }
    }
  }

  const runCalculate = async () => {
    const sid = sessionId.trim()
    if (!sid) {
      setCalc(DEMO_CALC)
      setUsingDemo(true)
      return
    }
    try {
      const res = await fetch(`/api/calculate/${encodeURIComponent(sid)}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCalc((await res.json()) as CalcPayload)
      setUsingDemo(false)
      setError('')
    } catch {
      setCalc(DEMO_CALC)
      setUsingDemo(true)
      setError('Calculation API unavailable. Showing demo metrics.')
    }
  }

  const lightClass = (light: string) => {
    if (light === 'green') return 'bg-emerald-400'
    if (light === 'yellow') return 'bg-amber-400'
    if (light === 'red') return 'bg-red-400'
    return 'bg-gray-600'
  }

  return (
    <div className="app-page">
      <div className="app-container space-y-4">
        <div className="flex items-center gap-4">
          <Link to="/simulations" className="text-slate-400 hover:text-cyan-300 text-sm">Back to Simulations</Link>
          <h1 className="app-title">Analyzer</h1>
          <span className="text-xs text-slate-400">
            {status ? `${status.sim_status} | t=${Math.round(status.sim_time)}s` : 'idle'}
          </span>
          {usingDemo && <span className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-700/40 rounded px-2 py-1">Demo data mode</span>}
        </div>

        <div className="app-panel p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Session ID</label>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="app-input w-72 text-sm font-mono"
              placeholder="session_..."
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Poll</label>
            <select
              value={pollIdx}
              onChange={(e) => setPollIdx(Number(e.target.value))}
              className="app-input text-sm"
            >
              <option value={0}>2s</option>
              <option value={1}>5s</option>
              <option value={2}>10s</option>
              <option value={3}>15s</option>
            </select>
          </div>
          <button onClick={start} className="app-btn-primary text-xs">
            {running ? 'Restart' : 'Start Analysis'}
          </button>
          <button onClick={loadReport} className="app-btn-secondary text-xs">
            Generate Report
          </button>
          <button onClick={runCalculate} className="app-btn-secondary text-xs">
            Calculate Key Metrics
          </button>
          <button onClick={showDebug} className="app-btn-secondary text-xs">
            Debug
          </button>
          <Link
            to={sessionId ? `/report?session=${encodeURIComponent(sessionId)}` : '/report'}
            className="app-btn-secondary text-xs"
          >
            Open Full Report
          </Link>
        </div>

        {error && <div className="text-sm text-amber-300">{error}</div>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card label="Active Vehicles" value={status?.active ?? '-'} />
          <Card label="Exited" value={status?.exited ?? '-'} />
          <Card label="Avg Wait" value={status ? `${status.avg_wait}s` : '-'} />
          <Card label="Throughput" value={status ? `${Math.round(status.throughput)} v/h` : '-'} />
          <Card label="Duration" value={status ? `${status.sim_duration_min}m` : '-'} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 app-panel p-4">
            <h3 className="text-sm text-gray-300 mb-3">Queue History</h3>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={status?.queue_history ?? []}>
                  <XAxis dataKey="t" stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="N" stroke="#22d3ee" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="S" stroke="#f472b6" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="E" stroke="#34d399" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="W" stroke="#f59e0b" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="app-panel p-4">
            <h3 className="text-sm text-gray-300 mb-3">Vehicle Type Distribution</h3>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={72}>
                    {typeData.map((entry, idx) => (
                      <Cell key={entry.name} fill={TYPE_COLORS[idx % TYPE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-[11px] text-gray-400 space-y-1 max-h-24 overflow-auto">
              {typeData.map((d, idx) => (
                <div key={d.name} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[idx % TYPE_COLORS.length] }} />
                    {d.name}
                  </span>
                  <span>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="app-panel p-4">
          <h3 className="text-sm text-gray-300 mb-3">Queue Depth per Arm and Signal Lights</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {(['N', 'S', 'E', 'W'] as Arm[]).map((arm) => {
              const q = status?.queue?.[arm] ?? 0
              const pct = Math.min(100, q * 8)
              return (
                <div key={arm} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                    <span>Arm {arm}</span>
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${lightClass(status?.lights?.[arm] || 'off')}`} />
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-gray-300 mt-2">{q} queued</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="app-panel p-4 space-y-3">
          <h3 className="text-sm text-gray-300">Analysis Report</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Total Exited" value={report.total_exited} />
            <Card label="Avg Wait" value={`${report.avg_wait_sec}s`} />
            <Card label="Throughput" value={`${Math.round(report.throughput_vph)} v/h`} />
            <Card label="Bottleneck" value={report.bottleneck_arm} />
          </div>

          <h4 className="text-xs uppercase tracking-wide text-gray-500 pt-2">Avg Queue per Arm</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['N', 'S', 'E', 'W'] as Arm[]).map((arm) => (
              <Card key={arm} label={`Arm ${arm}`} value={report.arm_avg_queue[arm]} />
            ))}
          </div>

          <h4 className="text-xs uppercase tracking-wide text-gray-500 pt-2">Recommendations</h4>
          <div className="text-xs text-gray-300 space-y-2">
            {report.recommendations.map((r, idx) => (
              <div key={`${r}-${idx}`} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">{r}</div>
            ))}
          </div>

          <h4 className="text-xs uppercase tracking-wide text-gray-500 pt-2">Signal Waste Events</h4>
          <div className="text-xs text-gray-400">
            {report.signal_waste_phases.length === 0 ? (
              <span>No major waste events detected.</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {report.signal_waste_phases.map((e, idx) => (
                  <span key={`${e.arm}-${e.t}-${idx}`} className="bg-gray-800 border border-gray-700 rounded px-2 py-1">
                    t={e.t}s, arm={e.arm}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="app-panel p-4 space-y-3">
          <h3 className="text-sm text-gray-300">Phase 03 Key Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Gini Fairness" value={calc.gini.toFixed(3)} />
            <Card label="Avg Pressure" value={calc.pressure_mean.toFixed(2)} />
            <Card label="Rows" value={calc.trajectory_rows} />
            <Card label="North Saturation" value={calc.saturation.N.toFixed(2)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(['N', 'S', 'E', 'W'] as Arm[]).map((arm) => (
              <div key={arm} className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-300">
                <div className="font-semibold mb-1">Arm {arm}</div>
                <div>Sat: {calc.saturation[arm].toFixed(2)}</div>
                <div>Discharge: {calc.discharge_rate[arm].toFixed(2)} veh/s</div>
                <div>TTS: {calc.time_to_starvation[arm].toFixed(1)}s</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900 border border-purple-900/40 border-dashed rounded-xl p-4">
          <h3 className="text-sm text-purple-300 mb-2">Claude API Reasoning (Demo Placeholder)</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            This section is reserved for natural-language diagnostics, timing strategy recommendations,
            and redesign suggestions based on calculated metrics.
          </p>
        </div>
      </div>
    </div>
  )
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3">
      <div className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold text-gray-200 mt-1">{value}</div>
    </div>
  )
}
