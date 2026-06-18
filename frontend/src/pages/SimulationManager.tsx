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
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()

  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected]
  )

  const loadPage = async (nextPage: number, queryVal = searchQuery) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/simulations?page=${nextPage}&per_page=20&q=${encodeURIComponent(queryVal)}`)
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
    const delayDebounceFn = setTimeout(() => {
      loadPage(1, searchQuery)
    }, 300)

    return () => clearTimeout(delayDebounceFn)
  }, [searchQuery])

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
          <div className="flex items-center gap-3">
            <h1 className="app-title">Simulations</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions..."
                className="w-64 bg-[#090c14]/90 border border-slate-700/60 focus:border-cyan-500/60 rounded-[10px] text-[#e8eefc] placeholder-slate-500 pl-9 pr-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.603 10.603z"
                />
              </svg>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
              )}
            </div>

            <button
              onClick={openCompare}
              disabled={selectedIds.length < 2}
              className="app-btn-secondary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Compare Selected
            </button>
          </div>
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
