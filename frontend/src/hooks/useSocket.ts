import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useSimulationStore } from '../store/simulationStore'
import { useSessionStore } from '../store/sessionStore'
import { useConfigStore } from '../store/configStore'
import type { SimFrame, AdverseEvent, TrainingEpisodePayload, InsightCard, EpisodeMetrics, EconomicSummary, Decision } from '../types'
import { useDecisionStore } from '../store/decisionStore'

// Singleton socket — one connection per app lifetime
let _socket: Socket | null = null

function getSocket(): Socket {
  if (!_socket) {
    _socket = io({
      // connects to same origin (proxied by vite dev server → Flask backend)
      transports: ['websocket', 'polling'],
      autoConnect: false,
      reconnectionDelay: 300,        // try reconnecting quickly on restore
      reconnectionDelayMax: 2000,    // cap at 2s so it never feels "stuck"
      reconnectionAttempts: Infinity, // keep trying until tab is closed
      timeout: 20000,
    })
  }
  return _socket
}

// Real PPO episodes are stochastic, so the latest single episode is noisy.
// We smooth the headline metrics (panel + economic) with an EMA while the
// training chart keeps the raw per-episode values. Reset at each training run.
let _waitEma: number | null = null
let _tputEma: number | null = null
const _EMA_ALPHA = 0.2
interface LiveTracker {
  prevIds: Set<string>
  prevWaitMap: Map<string, number>  // id → wait_time at previous frame
  exited: number
  totalWait: number               // cumulative wait of all exited vehicles (sim-seconds)
}
const _liveTrackers = new Map<string, LiveTracker>()

function _resetEma(): void {
  _waitEma = null
  _tputEma = null
}

// Per-key EMA smoothing for live sim KPI values (avg wait, etc.) so headline
// numbers read steadily instead of jittering every frame.
const _metricEma = new Map<string, number>()
const _METRIC_ALPHA = 0.12
function _smoothMetric(key: string, value: number): number {
  const prev = _metricEma.get(key)
  const next = prev === undefined ? value : _METRIC_ALPHA * value + (1 - _METRIC_ALPHA) * prev
  _metricEma.set(key, next)
  return next
}

function _resetLiveTrackers(sessionId?: string): void {
  if (!sessionId) {
    _liveTrackers.clear()
    _metricEma.clear()
    return
  }
  Array.from(_liveTrackers.keys()).forEach((k) => {
    if (k.startsWith(`${sessionId}:`)) {
      _liveTrackers.delete(k)
    }
  })
  Array.from(_metricEma.keys()).forEach((k) => {
    if (k.startsWith(`${sessionId}:`)) {
      _metricEma.delete(k)
    }
  })
}

// Build a partial EpisodeMetrics from a training episode payload
function _episodeToMetrics(ep: TrainingEpisodePayload): EpisodeMetrics {
  const rawWait = ep.metrics?.mean_wait ?? 0
  const rawTput = ep.metrics?.throughput ?? 0
  _waitEma = _waitEma === null ? rawWait : _EMA_ALPHA * rawWait + (1 - _EMA_ALPHA) * _waitEma
  _tputEma = _tputEma === null ? rawTput : _EMA_ALPHA * rawTput + (1 - _EMA_ALPHA) * _tputEma
  const wait = _waitEma
  const tput = Math.round(_tputEma)
  return {
    episode_id: String(ep.episode),
    session_id: ep.session_id,
    duration_s: ep.length ?? 3600,
    n_vehicles: tput,
    avg_wait_s: wait,
    per_type: {},
    per_arm: {
      N: { arm: 'N', queue_len: Math.round(tput * 0.06), avg_wait_s: wait * 1.1, flow_rate_vph: Math.round(tput * 0.27), heavy_vehicle_ratio: 0.12, green_time_used_s: 26, green_time_total_s: 30 },
      S: { arm: 'S', queue_len: Math.round(tput * 0.05), avg_wait_s: wait * 0.9, flow_rate_vph: Math.round(tput * 0.23), heavy_vehicle_ratio: 0.10, green_time_used_s: 24, green_time_total_s: 30 },
      E: { arm: 'E', queue_len: Math.round(tput * 0.04), avg_wait_s: wait * 0.95, flow_rate_vph: Math.round(tput * 0.25), heavy_vehicle_ratio: 0.08, green_time_used_s: 25, green_time_total_s: 28 },
      W: { arm: 'W', queue_len: Math.round(tput * 0.03), avg_wait_s: wait * 1.05, flow_rate_vph: Math.round(tput * 0.25), heavy_vehicle_ratio: 0.09, green_time_used_s: 23, green_time_total_s: 28 },
    },
    throughput_vph: tput,
    green_utilisation: Math.min(0.95, 0.60 + ep.episode * 0.003),
    collision_count: 0,
    violation_count: 0,
    signal_efficiency: Math.min(0.95, 0.55 + ep.episode * 0.003),
    avg_phase_duration_s: 28,
    adverse_events_count: 0,
    total_delay_veh_hrs: (wait * tput) / 3600,
  }
}

// India-calibrated economic constants (blended fleet, Hyderabad GHMC)
const _ECON = {
  idleFuelLPerHr: 0.7,        // avg idle consumption across mixed fleet
  co2KgPerL: 2.31,            // petrol combustion CO2 factor
  petrolInrPerL: 105,
  wageInrPerHr: 150,
  carbonInrPerTonne: 2000,
  cityIntersections: 650,
  dailyTripsPerIntersection: 5000,
}

// Compute an EconomicSummary client-side mirroring backend/analytics/economic.py.
// Uses a blended-fleet aggregate since mock metrics carry no per_type breakdown.
function _economicFromMetrics(baseline: EpisodeMetrics, current: EpisodeMetrics): EconomicSummary {
  const baselineWait = baseline.avg_wait_s
  const rlWait = current.avg_wait_s
  const waitSaved = Math.max(0, baselineWait - rlWait)
  const nVeh = Math.max(current.n_vehicles, 1)

  const hrsSaved = waitSaved / 3600
  const fuelPerVeh = _ECON.idleFuelLPerHr * hrsSaved
  const co2PerVeh = fuelPerVeh * _ECON.co2KgPerL
  const fuelCostPerVeh = fuelPerVeh * _ECON.petrolInrPerL
  const timeValPerVeh = hrsSaved * _ECON.wageInrPerHr
  const totalPerVeh = fuelCostPerVeh + timeValPerVeh

  const totalFuel = fuelPerVeh * nVeh
  const totalCo2Kg = co2PerVeh * nVeh
  const totalCo2T = totalCo2Kg / 1000
  const totalFuelCost = fuelCostPerVeh * nVeh
  const totalTimeVal = timeValPerVeh * nVeh
  const totalSaving = totalFuelCost + totalTimeVal

  const carbonCredit = totalCo2T * _ECON.carbonInrPerTonne

  const tripsScale = _ECON.dailyTripsPerIntersection / nVeh
  const cityDaily = totalSaving * _ECON.cityIntersections * tripsScale
  const cityAnnual = cityDaily * 365
  const cityAnnualCo2T = totalCo2T * _ECON.cityIntersections * tripsScale * 365

  return {
    session_id: current.session_id,
    baseline_avg_wait_s: baselineWait,
    rl_avg_wait_s: rlWait,
    wait_reduction_s: waitSaved,
    fuel_saved_l_per_veh: fuelPerVeh,
    co2_avoided_kg_per_veh: co2PerVeh,
    fuel_cost_saved_inr_per_veh: fuelCostPerVeh,
    time_value_saved_inr_per_veh: timeValPerVeh,
    total_saving_inr_per_veh: totalPerVeh,
    total_fuel_saved_l: totalFuel,
    total_co2_avoided_kg: totalCo2Kg,
    total_co2_avoided_tonne: totalCo2T,
    total_fuel_cost_saved_inr: totalFuelCost,
    total_time_value_saved_inr: totalTimeVal,
    total_saving_inr: totalSaving,
    carbon_credit_value_inr: carbonCredit,
    city_intersections: _ECON.cityIntersections,
    city_daily_saving_inr: cityDaily,
    city_annual_saving_inr: cityAnnual,
    city_annual_co2_avoided_tonne: cityAnnualCo2T,
    per_type: {},
  }
}

// Build baseline metrics (fixed-time controller reference) from the real
// fixed-time episode the backend runs on the same simulator. Falls back to
// representative numbers if no baseline event has arrived yet.
function _baselineMetrics(sessionId: string, wait = 85, tput = 260): EpisodeMetrics {
  const simConfig = useConfigStore.getState().simConfig
  const greenVal = (simConfig.baseline_green_util ?? 85.0) / 100
  const coordVal = (simConfig.baseline_coordination ?? 83.0) / 100
  const durationS = Number(simConfig.simulation_duration_s ?? 1800)
  const safeWait = Number.isFinite(wait) ? wait : 0
  const safeTput = Number.isFinite(tput) ? tput : 0

  return {
    episode_id: 'baseline',
    session_id: sessionId,
    duration_s: durationS,
    n_vehicles: safeTput,
    avg_wait_s: safeWait,
    per_type: {},
    per_arm: {
      N: { arm: 'N', queue_len: Math.round(safeTput * 0.07), avg_wait_s: safeWait * 1.08, flow_rate_vph: Math.round(safeTput * 0.27), heavy_vehicle_ratio: 0.15, green_time_used_s: 22, green_time_total_s: 30 },
      S: { arm: 'S', queue_len: Math.round(safeTput * 0.06), avg_wait_s: safeWait * 0.94, flow_rate_vph: Math.round(safeTput * 0.24), heavy_vehicle_ratio: 0.12, green_time_used_s: 20, green_time_total_s: 30 },
      E: { arm: 'E', queue_len: Math.round(safeTput * 0.05), avg_wait_s: safeWait * 0.98, flow_rate_vph: Math.round(safeTput * 0.25), heavy_vehicle_ratio: 0.10, green_time_used_s: 21, green_time_total_s: 28 },
      W: { arm: 'W', queue_len: Math.round(safeTput * 0.04), avg_wait_s: safeWait * 1.0, flow_rate_vph: Math.round(safeTput * 0.24), heavy_vehicle_ratio: 0.11, green_time_used_s: 20, green_time_total_s: 28 },
    },
    throughput_vph: safeTput,
    green_utilisation: greenVal,
    collision_count: 0,
    violation_count: 0,
    signal_efficiency: coordVal,
    avg_phase_duration_s: 30,
    adverse_events_count: 0,
    total_delay_veh_hrs: (safeWait * safeTput) / 3600,
  }
}

function _computeLiveSimulationMetrics(key: string, frame: SimFrame): EpisodeMetrics {
  const simConfig = useConfigStore.getState().simConfig
  const vehicles = frame.vehicles
  const total = vehicles.length

  const trackerKey = `${frame.session_id ?? 'live'}:${key}`
  const tracker: LiveTracker = _liveTrackers.get(trackerKey) ?? {
    prevIds: new Set<string>(),
    prevWaitMap: new Map<string, number>(),
    exited: 0,
    totalWait: 0,
  }

  const currIds = new Set<string>(vehicles.map((v) => String(v.id)))

  // For each vehicle that was on-screen last frame but isn't now (i.e. exited),
  // capture its final accumulated wait_time from the previous frame snapshot.
  // This is SPEED-INVARIANT: wait_time is in sim-seconds and doesn't depend on
  // how many real-seconds passed — a vehicle waiting through a 28s red phase
  // always exits with wait_time ≈ 28 whether the sim ran at 1× or 20×.
  tracker.prevIds.forEach((id) => {
    if (!currIds.has(id)) {
      tracker.exited += 1
      tracker.totalWait += tracker.prevWaitMap.get(id) ?? 0
    }
  })

  // Update the wait map for vehicles currently on screen
  tracker.prevWaitMap = new Map(vehicles.map((v) => [String(v.id), v.wait_time ?? 0]))
  tracker.prevIds = currIds
  _liveTrackers.set(trackerKey, tracker)

  const simTime = Math.max(Number(frame.sim_time_s ?? 0), 0.001)
  const tput = Math.round((tracker.exited / simTime) * 3600)

  // Cumulative average — use backend's system-wide average wait if available
  // to correctly include queue/backlog and canvas delay. Otherwise fallback.
  const avgWait = frame.stats !== undefined && frame.stats !== null
    ? frame.stats.avg_wait_s
    : (tracker.exited > 0 ? tracker.totalWait / tracker.exited : 0)

  const systemTput = frame.stats !== undefined && frame.stats !== null
    ? frame.stats.throughput_vph
    : tput

  const moving = vehicles.filter((v) => (v.speed ?? 0) >= 0.5).length
  const util = total > 0 ? Math.min(1, Math.max(0, moving / total)) : 0

  // Signal Coordination = share of vehicles that progressed through without a
  // meaningful stop (wait_time < 2s). High when greens align with platoons;
  // a fixed-time baseline scores lower because more vehicles hit a red.
  const freeFlowing = vehicles.filter((v) => (v.wait_time ?? 0) < 2.0).length
  const eff = total > 0 ? Math.min(1, Math.max(0, freeFlowing / total)) : 0

  const perArm = (['N', 'S', 'E', 'W'] as const).reduce<Record<string, EpisodeMetrics['per_arm']['N']>>((acc, arm) => {
    const armVehicles = vehicles.filter((v) => v.arm === arm)
    const armStopped = armVehicles.filter((v) => (v.speed ?? 0) < 0.5)
    const armWait = armStopped.length
      ? armStopped.reduce((sum, v) => sum + (v.wait_time ?? 0), 0) / armStopped.length
      : 0
    acc[arm] = {
      arm,
      queue_len: armStopped.length,
      avg_wait_s: armWait,
      flow_rate_vph: Math.round((armVehicles.length / simTime) * 3600),
      heavy_vehicle_ratio: armVehicles.length
        ? armVehicles.filter((v) => v.type_id === 'truck' || v.type_id === 'tsrtc_bus' || v.type_id === 'school_bus').length / armVehicles.length
        : 0,
      green_time_used_s: util * Number(frame.signals?.[0]?.duration_s ?? 0),
      green_time_total_s: Number(frame.signals?.[0]?.duration_s ?? 0),
    }
    return acc
  }, {})

  return {
    episode_id: key,
    session_id: frame.session_id ?? 'live',
    duration_s: Number(simConfig.simulation_duration_s ?? 1800),
    n_vehicles: frame.stats !== undefined && frame.stats !== null ? frame.stats.in_queue + frame.stats.exited : total,
    avg_wait_s: avgWait,
    per_type: {},
    per_arm: perArm,
    throughput_vph: systemTput,
    green_utilisation: util,
    collision_count: Array.isArray((frame as unknown as { collision_ids?: unknown[] }).collision_ids)
      ? ((frame as unknown as { collision_ids: unknown[] }).collision_ids.length)
      : 0,
    violation_count: 0,
    signal_efficiency: eff,
    avg_phase_duration_s: Number(frame.signals?.[0]?.duration_s ?? 0),
    adverse_events_count: 0,
    total_delay_veh_hrs: (avgWait * systemTput) / 3600,
  }
}

let _listenersRegistered = false

function registerGlobalListeners(socket: Socket) {
  if (_listenersRegistered) return
  _listenersRegistered = true

  // Server → Client event handlers
  socket.on('server:hello', (data: { version: string; status: string }) => {
    console.log('[Socket] Connected:', data)
  })

  socket.on('sim:frame:baseline', (frame: SimFrame) => {
    const store = useSimulationStore.getState()
    const activeSid = store.sessionId
    const session_id = frame.session_id
    if (session_id && session_id.startsWith('popup_')) {
      const parts = session_id.split('_')
      const ep = Number(parts[1])
      if (!isNaN(ep)) {
        store.setPopupFrame(ep, frame)
        store.setPopupSimTime(ep, frame.sim_time_s ?? 0)
        return
      }
    }
    if (!activeSid || (frame.session_id && frame.session_id !== activeSid)) return
    // Accept frames to update store — setRunning(true) arrives before frames but we
    // don't gate on isRunning here so first frames are never silently dropped.
    if (!store.isRunning) store.setRunning(true)
    store.setBaselineFrame(frame)

    const simMetrics = _computeLiveSimulationMetrics('baseline', frame)
    store.setLastSimulationMetrics('baseline', simMetrics)
    useSessionStore.getState().setBaselineMetrics(simMetrics)

    const selected = store.selectedModelSingle
    if (selected === 'baseline') {
      store.setFrame(frame)
    }
  })

  socket.on('sim:frame:rl1', (frame: SimFrame) => {
    const store = useSimulationStore.getState()
    const activeSid = store.sessionId
    const session_id = frame.session_id
    if (session_id && session_id.startsWith('popup_')) {
      const parts = session_id.split('_')
      const ep = Number(parts[1])
      if (!isNaN(ep)) {
        store.setPopupFrame(ep, frame)
        store.setPopupSimTime(ep, frame.sim_time_s ?? 0)
        return
      }
    }
    if (!activeSid || (frame.session_id && frame.session_id !== activeSid)) return
    if (!store.isRunning) store.setRunning(true)
    store.setRl1Frame(frame)
    const simMetrics = _computeLiveSimulationMetrics('rl1', frame)
    store.setLastSimulationMetrics('rl1', simMetrics)
    if (store.selectedModelSingle === 'rl1') store.setFrame(frame)
  })

  socket.on('sim:frame:rl2', (frame: SimFrame) => {
    const store = useSimulationStore.getState()
    const activeSid = store.sessionId
    const session_id = frame.session_id
    if (session_id && session_id.startsWith('popup_')) {
      const parts = session_id.split('_')
      const ep = Number(parts[1])
      if (!isNaN(ep)) {
        store.setPopupFrame(ep, frame)
        store.setPopupSimTime(ep, frame.sim_time_s ?? 0)
        return
      }
    }
    if (!activeSid || (frame.session_id && frame.session_id !== activeSid)) return
    if (!store.isRunning) store.setRunning(true)
    store.setRl2Frame(frame)
    const simMetrics = _computeLiveSimulationMetrics('rl2', frame)
    store.setLastSimulationMetrics('rl2', simMetrics)
    if (store.selectedModelSingle === 'rl2') store.setFrame(frame)
  })

  socket.on('sim:frame:rl3', (frame: SimFrame) => {
    const store = useSimulationStore.getState()
    const activeSid = store.sessionId
    const session_id = frame.session_id
    if (session_id && session_id.startsWith('popup_')) {
      const parts = session_id.split('_')
      const ep = Number(parts[1])
      if (!isNaN(ep)) {
        store.setPopupFrame(ep, frame)
        store.setPopupSimTime(ep, frame.sim_time_s ?? 0)
        return
      }
    }
    if (!activeSid || (frame.session_id && frame.session_id !== activeSid)) return
    if (!store.isRunning) store.setRunning(true)
    store.setRl3Frame(frame)
    const simMetrics = _computeLiveSimulationMetrics('rl3', frame)
    store.setLastSimulationMetrics('rl3', simMetrics)
    if (store.selectedModelSingle === 'rl3') store.setFrame(frame)
  })

  socket.on('sim:frame:rl4', (frame: SimFrame) => {
    const store = useSimulationStore.getState()
    const activeSid = store.sessionId
    const session_id = frame.session_id
    if (session_id && session_id.startsWith('popup_')) {
      const parts = session_id.split('_')
      const ep = Number(parts[1])
      if (!isNaN(ep)) {
        store.setPopupFrame(ep, frame)
        store.setPopupSimTime(ep, frame.sim_time_s ?? 0)
        return
      }
    }
    if (!activeSid || (frame.session_id && frame.session_id !== activeSid)) return
    if (!store.isRunning) store.setRunning(true)
    store.setRl4Frame(frame)
    const simMetrics = _computeLiveSimulationMetrics('rl4', frame)
    store.setLastSimulationMetrics('rl4', simMetrics)
    if (store.selectedModelSingle === 'rl4') store.setFrame(frame)
  })

  socket.on('sim:frame:custom', (frame: SimFrame) => {
    const store = useSimulationStore.getState()
    const activeSid = store.sessionId
    const session_id = frame.session_id
    if (session_id && session_id.startsWith('popup_')) {
      const parts = session_id.split('_')
      const ep = Number(parts[1])
      if (!isNaN(ep)) {
        store.setPopupFrame(ep, frame)
        store.setPopupSimTime(ep, frame.sim_time_s ?? 0)
        return
      }
    }
    if (!activeSid || (frame.session_id && frame.session_id !== activeSid)) return
    if (!store.isRunning) store.setRunning(true)
    store.setCustomFrame(frame)
    const simMetrics = _computeLiveSimulationMetrics('custom', frame)
    store.setLastSimulationMetrics('custom', simMetrics)
    if (store.selectedModelSingle === 'custom') store.setFrame(frame)
  })

  socket.on('sim:started', (data?: { session_id?: string }) => {
    const store = useSimulationStore.getState()
    const activeSid = store.sessionId
    const session_id = data?.session_id
    if (session_id && session_id.startsWith('popup_')) {
      const parts = session_id.split('_')
      const ep = Number(parts[1])
      if (!isNaN(ep)) {
        store.setPopupRunning(ep, true)
        return
      }
    }
    if (!activeSid || (data?.session_id && data.session_id !== activeSid)) return
    _resetLiveTrackers(data?.session_id ?? activeSid ?? undefined)
    store.setRunning(true)
    if (store.selectedModelSingle === 'baseline') {
      useSessionStore.getState().setBaselineCompleted(false)
    }
  })

  socket.on('sim:stopped', (data?: { session_id?: string; completed?: boolean }) => {
    const store = useSimulationStore.getState()
    const activeSid = store.sessionId
    const session_id = data?.session_id
    if (session_id && session_id.startsWith('popup_')) {
      const parts = session_id.split('_')
      const ep = Number(parts[1])
      if (!isNaN(ep)) {
        store.setPopupRunning(ep, false)
        store.setPopupPaused(ep, false)
        return
      }
    }
    if (!activeSid || (data?.session_id && data.session_id !== activeSid)) return
    store.setRunning(false)
    if (store.selectedModelSingle === 'baseline') {
      useSessionStore.getState().setBaselineCompleted(!!data?.completed)
    }
  })

  socket.on('sim:speed_set', (data?: { session_id?: string; multiplier?: number }) => {
    const store = useSimulationStore.getState()
    const activeSid = store.sessionId
    const session_id = data?.session_id
    if (session_id && session_id.startsWith('popup_')) {
      const parts = session_id.split('_')
      const ep = Number(parts[1])
      if (!isNaN(ep)) {
        const m = data?.multiplier
        if (m === 1 || m === 5 || m === 10 || m === 20) store.setPopupSpeed(ep, m)
        return
      }
    }
    if (!activeSid || (data?.session_id && data.session_id !== activeSid)) return
    const m = data?.multiplier
    if (m === 1 || m === 5 || m === 10 || m === 20) store.setSimSpeed(m)
  })

  socket.on('sim:error', (data?: { error?: string; session_id?: string }) => {
    const store = useSimulationStore.getState()
    const session_id = data?.session_id
    if (session_id && session_id.startsWith('popup_')) {
      const parts = session_id.split('_')
      const ep = Number(parts[1])
      if (!isNaN(ep)) {
        store.setPopupRunning(ep, false)
        store.setPopupPaused(ep, false)
        return
      }
    }
    store.setRunning(false)
    store.setPaused(false)
    console.error('[Socket] sim:error', data?.error ?? data)
  })

  socket.on('adverse:event', (event: AdverseEvent & { session_id?: string }) => {
    const store = useSimulationStore.getState()
    const isRunning = store.isRunning
    const activeSid = store.sessionId
    if (!isRunning) return
    if (!activeSid || (event?.session_id && event.session_id !== activeSid)) return
    store.addAdverseEvent(event)
  })

  socket.on('training:episode', (ep: TrainingEpisodePayload) => {
    const sessionStore = useSessionStore.getState()
    const simStore = useSimulationStore.getState()
    const isTraining = sessionStore.isTraining
    const activeSid = simStore.sessionId
    if (!isTraining) return
    if (!activeSid || (ep.session_id && ep.session_id !== activeSid)) return
    sessionStore.addEpisode(ep)
    // Track per-episode summary in decision store for the XAI sidebar
    useDecisionStore.getState().addEpisodeSummary({
      episode: ep.episode,
      total_reward: ep.reward,
      mean_wait: ep.metrics?.mean_wait ?? 0,
      throughput: ep.metrics?.throughput ?? 0,
      n_decisions: ep.length ?? 40,
    })
    const current = _episodeToMetrics(ep)
    sessionStore.setCurrentMetrics(current)
    // A real baseline (from running the Baseline tab) is authoritative and must not
    // be clobbered by the weaker MockTrafficEnv training baseline. Prefer it; only
    // seed a mock baseline when no real one and no stored baseline exists yet.
    const realBaseline = simStore.lastSimulationMetrics['baseline']
    let baseline: EpisodeMetrics
    if (realBaseline) {
      baseline = realBaseline
    } else if (sessionStore.baselineMetrics) {
      baseline = sessionStore.baselineMetrics
    } else {
      baseline = _baselineMetrics(ep.session_id)
      sessionStore.setBaselineMetrics(baseline)
    }
    sessionStore.setEconomic(_economicFromMetrics(baseline, current))

    const activeModel = simStore.selectedModelSingle
    if (activeModel !== 'baseline') {
      sessionStore.saveModelDetails(activeModel)
    }
  })

  socket.on('training:baseline', (data: { session_id: string; metrics: { mean_wait: number; throughput: number } }) => {
    const sessionStore = useSessionStore.getState()
    const simStore = useSimulationStore.getState()
    const isTraining = sessionStore.isTraining
    const activeSid = simStore.sessionId
    if (!isTraining) return
    if (!activeSid || (data.session_id && data.session_id !== activeSid)) return
    // A real baseline (from running the Baseline tab) is authoritative — never let
    // the training engine's mock baseline overwrite it. Only seed when absent.
    if (simStore.lastSimulationMetrics['baseline']) return
    sessionStore.setBaselineMetrics(_baselineMetrics(data.session_id, data.metrics.mean_wait, data.metrics.throughput))
  })

  // Baseline tab pre-computation result — save to store for Training HUD display
  socket.on('baseline:computed', (data: { session_id?: string; mean_wait?: number; throughput?: number; controller?: string; error?: string }) => {
    if (data.error) {
      console.warn('[baseline:computed] error:', data.error)
      return
    }
    useSessionStore.getState().setBaselineData({
      mean_wait: data.mean_wait ?? 0,
      throughput: data.throughput ?? 0,
      controller: data.controller ?? 'fixed_time',
    })
  })

  socket.on('training:started', (data?: { session_id?: string }) => {
    const simStore = useSimulationStore.getState()
    const sessionStore = useSessionStore.getState()
    const activeSid = simStore.sessionId
    if (!activeSid || (data?.session_id && data.session_id !== activeSid)) return
    _resetEma()
    sessionStore.setTraining(true)
    sessionStore.setConverged(false)
  })

  socket.on('training:stopped', (data?: { session_id?: string }) => {
    const simStore = useSimulationStore.getState()
    const sessionStore = useSessionStore.getState()
    const activeSid = simStore.sessionId
    if (!activeSid || (data?.session_id && data.session_id !== activeSid)) return
    sessionStore.setTraining(false)

    // Mark the model that was actually being trained — not whatever tab is now
    // viewed. trainingModelKey is the source of truth set when training began.
    const trainedModel = sessionStore.trainingModelKey ?? simStore.selectedModelSingle
    if (trainedModel && trainedModel !== 'baseline') {
      simStore.addTrainedModel(trainedModel)
      sessionStore.saveModelDetails(trainedModel)
    }
    sessionStore.setTrainingModelKey(null)

    if (activeSid) {
      socket.emit('sim:stop', { session_id: activeSid })
    }
    simStore.resetSimulation()
  })

  socket.on('training:stage_change', (data: { session_id?: string; from_stage: number; to_stage: number; done?: boolean }) => {
    const simStore = useSimulationStore.getState()
    const activeSid = simStore.sessionId
    if (activeSid && data.session_id && data.session_id !== activeSid) return
    const sessionStore = useSessionStore.getState()
    if (data.done) {
      sessionStore.setTrainingStage(0)
    } else {
      sessionStore.setTrainingStage(data.to_stage)
    }
  })

  socket.on('training:converged', (data?: { session_id?: string }) => {
    const simStore = useSimulationStore.getState()
    const sessionStore = useSessionStore.getState()
    const activeSid = simStore.sessionId
    if (!activeSid || (data?.session_id && data.session_id !== activeSid)) return
    sessionStore.setConverged(true)
    sessionStore.setTraining(false)

    const trainedModel = sessionStore.trainingModelKey ?? simStore.selectedModelSingle
    if (trainedModel && trainedModel !== 'baseline') {
      simStore.addTrainedModel(trainedModel)
      sessionStore.saveModelDetails(trainedModel)
    }
    sessionStore.setTrainingModelKey(null)

    if (activeSid) {
      socket.emit('sim:stop', { session_id: activeSid })
    }
    simStore.resetSimulation()
  })

  socket.on('training:insight', (insight: InsightCard) => {
    const simStore = useSimulationStore.getState()
    const sessionStore = useSessionStore.getState()
    const isTraining = sessionStore.isTraining
    const activeSid = simStore.sessionId
    if (!isTraining) return
    if (!activeSid || (insight.session_id && insight.session_id !== activeSid)) return
    sessionStore.addInsight(insight)

    const activeModel = simStore.selectedModelSingle
    if (activeModel !== 'baseline') {
      sessionStore.saveModelDetails(activeModel)
    }
  })

  socket.on('training:decision', (d: Decision) => {
    const simStore = useSimulationStore.getState()
    const activeSid = simStore.sessionId
    const payload = d as unknown as Decision & { session_id?: string }
    if (activeSid && payload.session_id !== undefined && payload.session_id !== activeSid) return
    useDecisionStore.getState().appendDecision(d)
  })

  // inference_start / inference_end events removed — inference checkpoints disabled
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const socket = getSocket()
    socketRef.current = socket

    if (!socket.connected) {
      socket.connect()
    }

    registerGlobalListeners(socket)

    // ── Background-tab resilience ────────────────────────────────────────────
    // When the browser is minimized/background'd, Chrome/Edge throttle JS timers
    // to 1 Hz, which can starve Socket.IO's heartbeat and cause a disconnect.
    // On reconnect we re-attach listeners and, if a simulation was in progress,
    // re-emit sim:start so the backend loop resumes for this client.

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      const s = getSocket()
      if (!s.connected) {
        s.connect()
      } else {
        // Socket still connected — re-subscribe to confirm the session is live
        const simStore = useSimulationStore.getState()
        if (simStore.isRunning && simStore.sessionId) {
          // Nothing to re-emit: backend loop is still running; frames will
          // resume immediately on next tick. Trigger a store nudge so the
          // canvas re-renders instead of showing a stale frozen frame.
          simStore.setRunning(true)
        }
      }
    }

    const handleReconnect = () => {
      registerGlobalListeners(socket)
      const simStore = useSimulationStore.getState()
      const { simConfig, adverseConfig } = useConfigStore.getState()
      // If a simulation was in progress, restart it on the new connection.
      if (simStore.isRunning && simStore.sessionId) {
        socket.emit('sim:start', {
          session_id: simStore.sessionId,
          sim_config: {
            ...simConfig,
            simulation_duration_s: 1800,
            sim_speed_multiplier: simStore.simSpeed,
          },
          adverse_config: adverseConfig,
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    socket.on('reconnect', handleReconnect)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      socket.off('reconnect', handleReconnect)
    }
  }, [])

  // Emit helpers
  const emit = useCallback(
    (event: string, data?: unknown) => {
      getSocket().emit(event, data)
    },
    []
  )

  const isConnected = useCallback(() => getSocket().connected, [])

  return { emit, isConnected, socket: getSocket() }
}
