import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

export default function PilotReport() {
  const [search] = useSearchParams()
  const [sessionId, setSessionId] = useState(search.get('session') || '')
  const [location, setLocation] = useState('Hyderabad - HITEC City Junction')
  const [htmlContent, setHtmlContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generateHtml = async () => {
    if (!sessionId) {
      setError('Enter a session ID')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/sessions/${sessionId}/report/html`)
      if (res.ok) {
        const html = await res.text()
        setHtmlContent(html)
      } else {
        setError('Failed to generate report')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const downloadPdf = () => {
    if (!sessionId) return
    window.open(`/api/sessions/${sessionId}/report/pdf`, '_blank')
  }

  return (
    <div className="app-page">
      <div className="app-container space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-gray-400 hover:text-cyan-300 text-sm">Back to Home</Link>
          <h1 className="app-title">Pilot Report</h1>
        </div>

        <div className="app-panel p-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Session ID</label>
              <input
                type="text"
                className="app-input w-full text-sm font-mono"
                placeholder="Enter session ID..."
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Location Name</label>
              <input
                type="text"
                className="app-input w-full text-sm"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-red-300 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button
              className="app-btn-primary text-sm disabled:opacity-50"
              onClick={generateHtml}
              disabled={loading}
            >
              {loading ? 'Generating...' : 'Preview Report'}
            </button>
            <button
              className="app-btn-secondary text-sm"
              onClick={downloadPdf}
            >
              Download PDF
            </button>
          </div>
        </div>

        {htmlContent && (
          <div className="app-panel overflow-hidden">
            <div className="p-3 border-b border-slate-700/70 flex items-center justify-between">
              <span className="text-sm text-slate-300">Report Preview</span>
              <button
                className="text-xs text-cyan-300 hover:text-cyan-200"
                onClick={downloadPdf}
              >
                Download PDF
              </button>
            </div>
            <iframe
              srcDoc={htmlContent}
              className="w-full h-[640px] border-0 bg-white"
              title="Pilot Report"
            />
          </div>
        )}
      </div>
    </div>
  )
}
