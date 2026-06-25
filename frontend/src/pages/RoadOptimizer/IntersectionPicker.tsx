import React, { useEffect, useState } from 'react'
import type { NamedIntersection, IntersectionConfig } from './types'

const API = '/api/optimizer'

interface Props {
  value: IntersectionConfig
  onChange: (cfg: IntersectionConfig) => void
}

const VEHICLE_MIX_OPTIONS = [
  { value: 'hyderabad_mixed', label: 'Hyderabad Mixed' },
  { value: 'cars_only', label: 'Cars Only' },
  { value: 'rush_hour', label: 'Rush Hour Heavy' },
  { value: 'western_mixed', label: 'Western Mixed' },
]

const TRAFFIC_PATTERN_OPTIONS = [
  { value: 'uniform', label: 'Uniform' },
  { value: 'morning_peak', label: 'Morning Peak' },
  { value: 'evening_peak', label: 'Evening Peak' },
  { value: 'bidirectional', label: 'Bidirectional' },
]

export default function IntersectionPicker({ value, onChange }: Props) {
  const [intersections, setIntersections] = useState<NamedIntersection[]>([])
  const [selectedId, setSelectedId] = useState(value.id)

  useEffect(() => {
    fetch(`${API}/intersections`)
      .then(r => r.json())
      .then(d => setIntersections(d.intersections || []))
      .catch(() => {})
  }, [])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    const found = intersections.find(i => i.id === id)
    if (found) {
      onChange({
        id: found.id,
        name: found.name,
        arms: found.arms,
        lanes_per_arm: found.lanes_per_arm,
        traffic_volume_vph: found.traffic_volume_vph,
        vehicle_mix: found.vehicle_mix,
        traffic_pattern: found.traffic_pattern,
      })
    }
  }

  const selected = intersections.find(i => i.id === selectedId)

  return (
    <div className="ro-card">
      <div className="ro-card-title">Intersection</div>

      <select
        className="ro-select"
        value={selectedId}
        onChange={e => handleSelect(e.target.value)}
        id="ro-intersection-select"
      >
        {intersections.map(i => (
          <option key={i.id} value={i.id}>{i.name}</option>
        ))}
      </select>

      {selected && (
        <p style={{ fontSize: 11, color: '#475569', marginTop: 8, lineHeight: 1.5 }}>
          {selected.description}
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <div className="ro-card-title">Intersection Config</div>
        <div className="ro-field-group">

          {/* Arms Selector */}
          <div className="ro-field">
            <div className="ro-field-header-row">
              <label className="ro-label">Arms</label>
              <span className="ro-field-value-badge">{value.arms}</span>
            </div>
            <div className="ro-chip-group">
              {[2, 3, 4, 5, 6].map(num => (
                <button
                  key={num}
                  type="button"
                  className={`ro-chip-btn ${value.arms === num ? 'selected' : ''}`}
                  onClick={() => onChange({ ...value, arms: num })}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Lanes / Arm Selector */}
          <div className="ro-field">
            <div className="ro-field-header-row">
              <label className="ro-label">Lanes / Arm</label>
              <span className="ro-field-value-badge">{value.lanes_per_arm}</span>
            </div>
            <div className="ro-chip-group">
              {[1, 2, 3, 4, 5].map(num => (
                <button
                  key={num}
                  type="button"
                  className={`ro-chip-btn ${value.lanes_per_arm === num ? 'selected' : ''}`}
                  onClick={() => onChange({ ...value, lanes_per_arm: num })}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Traffic Volume Range + Input */}
          <div className="ro-field">
            <div className="ro-field-header-row">
              <label className="ro-label">Traffic Volume</label>
              <span className="ro-field-value-badge">{value.traffic_volume_vph} vph</span>
            </div>
            <div className="ro-slider-container">
              <input
                id="ro-volume-slider"
                type="range"
                min={100} max={8000} step={100}
                className="ro-slider"
                value={value.traffic_volume_vph}
                onChange={e => onChange({ ...value, traffic_volume_vph: +e.target.value })}
              />
              <input
                id="ro-volume-input"
                type="number"
                min={100} max={8000} step={100}
                className="ro-input"
                style={{ width: '70px', padding: '6px', textAlign: 'center' }}
                value={value.traffic_volume_vph}
                onChange={e => onChange({ ...value, traffic_volume_vph: +e.target.value })}
              />
            </div>
          </div>

          {/* Vehicle Mix */}
          <div className="ro-field">
            <label className="ro-label">Vehicle Mix</label>
            <select
              id="ro-vehicle-mix-select"
              className="ro-select"
              value={value.vehicle_mix}
              onChange={e => onChange({ ...value, vehicle_mix: e.target.value })}
            >
              {VEHICLE_MIX_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Traffic Pattern */}
          <div className="ro-field">
            <label className="ro-label">Traffic Pattern</label>
            <select
              id="ro-traffic-pattern-select"
              className="ro-select"
              value={value.traffic_pattern}
              onChange={e => onChange({ ...value, traffic_pattern: e.target.value })}
            >
              {TRAFFIC_PATTERN_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

        </div>
      </div>
    </div>
  )
}
