import { buildImpactMetricCard, getPotentialCarbonCreditValueInr } from './impactMetrics.ts'
import type { EpisodeMetrics } from '../types/index.ts'

function assertEqual(actual: unknown, expected: unknown) {
  if (!Object.is(actual, expected)) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`)
  }
}

function metrics(overrides: Partial<EpisodeMetrics>): EpisodeMetrics {
  return {
    episode_id: 'test',
    session_id: 'session-1',
    duration_s: 300,
    n_vehicles: 100,
    avg_wait_s: 0,
    per_type: {},
    per_arm: {},
    throughput_vph: 0,
    green_utilisation: 0,
    collision_count: 0,
    violation_count: 0,
    signal_efficiency: 0,
    avg_phase_duration_s: 0,
    adverse_events_count: 0,
    total_delay_veh_hrs: 0,
    fuel_index_ml_veh: 21,
    carbon_index_g_veh: 49,
    ...overrides,
  }
}

const singleFuel = buildImpactMetricCard({
  kind: 'fuel',
  mode: 'single',
  activeKeys: ['rl1'],
  metricsMap: {
    rl1: metrics({ n_vehicles: 100, fuel_index_ml_veh: 21 }),
  },
})

assertEqual(singleFuel.label, 'Fuel Wasted (Idle)')
assertEqual(singleFuel.unit, ' L')
assertEqual(singleFuel.rows[0].value, 2.1)
assertEqual(singleFuel.rows[0].perVehicleValue, 21)
assertEqual(singleFuel.rows[0].secondaryText, '21.0 mL/veh')
assertEqual('secondaryText' in singleFuel.rows[0], true)

const singleCarbon = buildImpactMetricCard({
  kind: 'carbon',
  mode: 'single',
  activeKeys: ['rl1'],
  metricsMap: {
    rl1: metrics({ n_vehicles: 100, carbon_index_g_veh: 49 }),
  },
})

assertEqual(singleCarbon.label, 'CO2 Emissions (Idle)')
assertEqual(singleCarbon.unit, ' kg')
assertEqual(singleCarbon.rows[0].value, 4.9)
assertEqual(singleCarbon.rows[0].perVehicleValue, 49)
assertEqual(singleCarbon.rows[0].secondaryText, '49.0 g/veh')
assertEqual('secondaryText' in singleCarbon.rows[0], true)

const splitFuel = buildImpactMetricCard({
  kind: 'fuel',
  mode: 'split',
  activeKeys: ['baseline', 'rl1'],
  metricsMap: {
    baseline: metrics({ n_vehicles: 100, fuel_index_ml_veh: 21 }),
    rl1: metrics({ n_vehicles: 100, fuel_index_ml_veh: 13 }),
  },
})

assertEqual(splitFuel.label, 'Fuel Wasted (Idle)')
assertEqual(splitFuel.unit, ' L')
assertEqual(splitFuel.rows[0].value, 2.1)
assertEqual(splitFuel.rows[0].perVehicleValue, 21)
assertEqual(splitFuel.rows[0].secondaryText, '21.0 mL/veh')
assertEqual(splitFuel.rows[1].value, 1.3)
assertEqual(splitFuel.rows[1].perVehicleValue, 13)
assertEqual(splitFuel.rows[1].secondaryText, '13.0 mL/veh')

const splitCarbon = buildImpactMetricCard({
  kind: 'carbon',
  mode: 'split',
  activeKeys: ['baseline', 'rl1'],
  metricsMap: {
    baseline: metrics({ n_vehicles: 100, carbon_index_g_veh: 49 }),
    rl1: metrics({ n_vehicles: 100, carbon_index_g_veh: 30 }),
  },
})

assertEqual(splitCarbon.label, 'CO2 Emissions (Idle)')
assertEqual(splitCarbon.unit, ' kg')
assertEqual(splitCarbon.rows[0].value, 4.9)
assertEqual(splitCarbon.rows[0].perVehicleValue, 49)
assertEqual(splitCarbon.rows[0].secondaryText, '49.0 g/veh')
assertEqual(splitCarbon.rows[1].value, 3.0)
assertEqual(splitCarbon.rows[1].perVehicleValue, 30)
assertEqual(splitCarbon.rows[1].secondaryText, '30.0 g/veh')
assertEqual(splitCarbon.potentialCarbonCreditInr, 3.8)
assertEqual(getPotentialCarbonCreditValueInr(1.9, 2000), 3.8)
