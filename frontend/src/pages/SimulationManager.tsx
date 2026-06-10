import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

interface SimulationItem {
  id: string
  created_at: string
  intersection: string
  total_vehicles: number
  duration_min: number
  throughput_vph: number
  status: 'done' | 'running' | 'stopped' | 'error' | string
}

interface SimulationResponse {
  page: number
  per_page: number
  total: number
  total_pages: number
  sims: SimulationItem[]
}

export default function SimulationManager() {
  const [data, setData] = useState<SimulationResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const navigate = useNavigate()

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  )

  const loadPage = async (nextPage: number) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/simulations?page=${nextPage}&per_page=20`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const payload = (await res.json()) as SimulationResponse
      setData(payload)
      setPage(payload.page)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load simulations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPage(1)
  }, [])

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [id]: checked }))
  }

  const openCompare = () => {
    if (selectedIds.length < 2) return
    navigate(`/compare?ids=${encodeURIComponent(selectedIds.join(','))}`)
  }

  return (
    <div className="app-page">
      <div className="app-container space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-400 hover:text-cyan-300 text-sm">Back to Home</Link>
            <h1 className="app-title">Simulations</h1>
          </div>
          <button
            onClick={openCompare}
            disabled={selectedIds.length < 2}
            className="app-btn-secondary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Compare Selected
          </button>
        </div>

        <div className="app-panel overflow-hidden">
          <div className="grid grid-cols-[30px_220px_120px_120px_130px_90px_100px] gap-3 px-4 py-3 text-[11px] uppercase tracking-wide text-gray-400 border-b border-slate-700/70">
            <span></span>
            <span>Session</span>
            <span>Intersection</span>
            <span className="text-right">Vehicles</span>
            <span className="text-right">Throughput</span>
            <span className="text-center">Status</span>
            <span></span>
          </div>

          {loading && <div className="px-4 py-10 text-center text-sm text-gray-400">Loading...</div>}
          {error && <div className="px-4 py-10 text-center text-sm text-red-300">{error}</div>}
          {!loading && !error && data?.sims.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-gray-400">No simulations found.</div>
          )}

          {!loading && !error && data?.sims.map((sim) => {
            const dot =
              sim.status === 'done' ? 'text-emerald-300' :
              sim.status === 'running' ? 'text-amber-300' :
              sim.status === 'error' ? 'text-red-300' : 'text-gray-400'
            return (
              <div
                key={sim.id}
                className="grid grid-cols-[30px_220px_120px_120px_130px_90px_100px] gap-3 px-4 py-3 border-b border-slate-700/60 last:border-b-0 text-xs items-center"
              >
                <input
                  type="checkbox"
                  checked={!!selected[sim.id]}
                  onChange={(e) => toggle(sim.id, e.target.checked)}
                />
                <div className="text-slate-200">
                  <div className="font-mono truncate">{sim.id}</div>
                  <div className="text-[10px] text-slate-400">{new Date(sim.created_at).toLocaleString()}</div>
                </div>
                <span className="text-slate-300 truncate">{sim.intersection}</span>
                <span className="text-right text-slate-100">{sim.total_vehicles.toLocaleString()}</span>
                <span className="text-right text-slate-100">{Math.round(sim.throughput_vph || 0)} v/h</span>
                <span className={`text-center font-semibold ${dot}`}>{sim.status}</span>
                <div className="flex flex-col items-end gap-1">
                  <Link
                    to={`/analyzer?session=${encodeURIComponent(sim.id)}`}
                    className="text-cyan-300 hover:text-cyan-200"
                  >
                    Analyze
                  </Link>
                  <button
                    onClick={() => navigate(`/decisions/${sim.id}`)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono transition-colors"
                  >
                    View Decisions →
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {data ? `${data.total} simulation(s) | page ${data.page} of ${data.total_pages}` : '-'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => loadPage(page - 1)}
              disabled={!data || page <= 1 || loading}
              className="app-btn-secondary text-xs disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={() => loadPage(page + 1)}
              disabled={!data || page >= data.total_pages || loading}
              className="app-btn-secondary text-xs disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
