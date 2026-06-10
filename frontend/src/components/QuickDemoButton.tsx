import { useState } from 'react'
import { useQuickDemo } from '../hooks/useQuickDemo'

export default function QuickDemoButton() {
  const [demoState, setDemoState] = useState({ isRunning: false, progress: 0, currentDescription: '' })
  const { startDemo, cancelDemo } = useQuickDemo()

  const handleStart = () => {
    startDemo((state) => setDemoState({ ...state }))
  }

  if (demoState.isRunning) {
    return (
      <div className="flex items-center gap-2.5 bg-[#0a0d14] border border-white/[0.08] rounded-lg px-3 py-1.5 min-w-[200px]">
        {/* Animated progress ring */}
        <svg width="16" height="16" viewBox="0 0 16 16" className="flex-shrink-0">
          <circle cx="8" cy="8" r="6" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
          <circle
            cx="8" cy="8" r="6" fill="none"
            stroke="#8fb8ce" strokeWidth="1.5"
            strokeDasharray={`${(demoState.progress / 100) * 37.7} 37.7`}
            strokeLinecap="round"
            transform="rotate(-90 8 8)"
            style={{ transition: 'stroke-dasharray 0.3s ease' }}
          />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400">Demo</span>
            <button
              className="text-[9px] font-mono text-slate-600 hover:text-[#f87171] transition-colors"
              onClick={() => { cancelDemo(); setDemoState({ isRunning: false, progress: 0, currentDescription: '' }) }}
            >
              ✕ Cancel
            </button>
          </div>
          <p className="text-[9px] text-slate-600 truncate mt-0.5 font-mono">{demoState.currentDescription || 'Loading...'}</p>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={handleStart}
      className="group flex items-center gap-2 bg-[#0a0d14] hover:bg-[#0d1118] border border-white/[0.09] hover:border-white/[0.16] text-slate-400 hover:text-slate-200 px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 tracking-wide"
    >
      {/* Minimal play icon */}
      <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
        <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5">
          <polygon points="1,0.5 9,5 1,9.5" fill="currentColor" opacity="0.7" />
        </svg>
      </span>
      Quick Demo
    </button>
  )
}
