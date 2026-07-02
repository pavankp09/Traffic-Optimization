import { useState, useEffect, useMemo, useRef } from 'react'
import { useConfigStore } from '../../store/configStore'
import type { Preset, PresetSummary } from '../../types'
import { FALLBACK_PRESETS, PRESET_GROUP_LABELS, PRESET_GROUP_ORDER } from '../../constants/presetCatalog'

interface PresetSelectorProps {
  onPresetLoaded?: (preset: Preset) => void
  compact?: boolean
}

export default function PresetSelector({ onPresetLoaded, compact = false }: PresetSelectorProps) {
  const [presets, setPresets] = useState<PresetSummary[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { activePreset, isDirty, loadPreset } = useConfigStore()

  useEffect(() => {
    let mounted = true
    fetch('/api/presets')
      .then((r) => r.json())
      .then((res) => {
        if (!mounted) return
        const data: PresetSummary[] = Array.isArray(res) ? res : (res?.data ?? [])
        if (data.length > 0) {
          setPresets(data)
        } else {
          setPresets(FALLBACK_PRESETS)
        }
      })
      .catch(() => {
        if (mounted) setPresets(FALLBACK_PRESETS)
      })

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const grouped = useMemo(() => {
    const grp: Record<string, PresetSummary[]> = {}
    presets.forEach((p) => {
      if (!grp[p.group]) grp[p.group] = []
      grp[p.group].push(p)
    })
    return grp
  }, [presets])

  const selectedName = activePreset?.name ?? 'Select a preset'

  const handleSelect = async (presetId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/presets/${presetId}`).then((r) => r.json())
      const preset = (res?.data ?? null) as Preset | null
      if (preset) {
        loadPreset(preset)
        onPresetLoaded?.(preset)
      }
    } catch {
      // Keep silent for now; fallback list still helps demo selection discoverability.
    } finally {
      setLoading(false)
      setIsOpen(false)
    }
  }

  return (
    <div className={compact ? "relative w-full" : "w-full"} ref={wrapperRef}>
      {!compact && <label className="block text-xs text-gray-500 mb-1.5">Load Preset</label>}

      <div className="relative">
        <button
          type="button"
          className={compact
            ? "w-full bg-[#090a0f] border border-white/[0.08] hover:border-white/20 rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-gray-100 focus:outline-none transition-colors min-w-[220px]"
            : "w-full bg-gray-800 border border-slate-500/50 hover:border-slate-400 rounded-xl px-3 py-2.5 text-left text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-slate-500/40 transition-colors"
          }
          onClick={() => setIsOpen((v) => !v)}
          disabled={loading}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">{selectedName}</span>
            <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
          </div>
        </button>

        {isOpen && (
          <div className={`absolute z-[100] mt-1.5 w-full max-h-[360px] overflow-y-auto rounded-xl border border-slate-600 bg-[#1b2433] shadow-2xl ${compact ? "right-0 min-w-[220px]" : ""}`}>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-slate-200 border-b border-slate-700 hover:bg-slate-700/30"
              onClick={() => setIsOpen(false)}
            >
              - Select a preset -
            </button>

            {PRESET_GROUP_ORDER.filter((g) => grouped[g]?.length).map((groupKey) => (
              <div key={groupKey} className="py-1">
                <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  {PRESET_GROUP_LABELS[groupKey] ?? groupKey}
                </div>

                {grouped[groupKey].map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${activePreset?.id === preset.id
                      ? 'bg-slate-600/60 text-white'
                      : 'text-slate-100 hover:bg-slate-700/40'
                      }`}
                    onClick={() => handleSelect(preset.id)}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {!compact && (
        <div className="mt-1 min-h-[18px] text-[11px]">
          {loading ? (
            <span className="text-slate-400">Loading preset...</span>
          ) : activePreset ? (
            <span className="text-slate-300">
              Active: <span className="text-slate-100">{activePreset.name}</span>
              {isDirty ? <span className="text-amber-400"> (modified)</span> : null}
            </span>
          ) : (
            <span className="text-slate-500">Choose a scenario preset</span>
          )}
        </div>
      )}
    </div>
  )
}
