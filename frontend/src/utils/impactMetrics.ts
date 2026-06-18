import type { EpisodeMetrics } from '../types'

export type ImpactMetricKind = 'fuel' | 'carbon'
export type ImpactMetricMode = 'single' | 'split'

export interface ImpactMetricRow {
  key: string
  value: number // total impact (L or kg)
  perVehicleValue: number // per-vehicle impact (mL or g)
  secondaryText: string // e.g. "78.2 mL/veh"
  totalImpact: number // total impact (L or kg)
}

export interface ImpactMetricCardData {
  label: string
  unit: string
  rows: ImpactMetricRow[]
  potentialCarbonCreditInr?: number
}

interface BuildImpactMetricCardArgs {
  kind: ImpactMetricKind
  mode: ImpactMetricMode
  activeKeys: string[]
  metricsMap: Record<string, EpisodeMetrics>
}

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10

function getTotalImpact(kind: ImpactMetricKind, metrics?: EpisodeMetrics): number {
  if (!metrics || metrics.n_vehicles <= 0) return 0
  const perVehicle = kind === 'fuel'
    ? metrics.fuel_index_ml_veh / 1000
    : metrics.carbon_index_g_veh / 1000
  return roundToOneDecimal(Math.max(0, perVehicle * metrics.n_vehicles))
}

function getPerVehicleImpact(kind: ImpactMetricKind, metrics?: EpisodeMetrics): number {
  if (!metrics) return 0
  const val = kind === 'fuel' ? metrics.fuel_index_ml_veh : metrics.carbon_index_g_veh
  return roundToOneDecimal(Math.max(0, val))
}

export function getPotentialCarbonCreditValueInr(co2AvoidedKg: number, carbonPriceInrPerTonne = 2000): number {
  return roundToOneDecimal(Math.max(0, co2AvoidedKg / 1000) * carbonPriceInrPerTonne)
}

export function buildImpactMetricCard({
  kind,
  mode,
  activeKeys,
  metricsMap,
}: BuildImpactMetricCardArgs): ImpactMetricCardData {
  const unit = kind === 'fuel' ? ' L' : ' kg'

  // Calculate potential fleet-wide carbon credit value if in split mode
  let potentialCarbonCreditInr: number | undefined
  if (kind === 'carbon' && mode === 'split' && activeKeys.includes('baseline')) {
    const baselineTotalKg = getTotalImpact('carbon', metricsMap.baseline)
    const otherKeys = activeKeys.filter((k) => k !== 'baseline')
    let maxAvoidedKg = 0
    otherKeys.forEach((key) => {
      const modelTotalKg = getTotalImpact('carbon', metricsMap[key])
      const avoidedKg = Math.max(0, baselineTotalKg - modelTotalKg)
      if (avoidedKg > maxAvoidedKg) {
        maxAvoidedKg = avoidedKg
      }
    })
    potentialCarbonCreditInr = getPotentialCarbonCreditValueInr(maxAvoidedKg, 2000)
  }

  const rows = activeKeys.map((key) => {
    const totalImpact = getTotalImpact(kind, metricsMap[key])
    const perVehicleValue = getPerVehicleImpact(kind, metricsMap[key])
    const secondaryText = kind === 'fuel'
      ? `${perVehicleValue.toFixed(1)} mL/veh`
      : `${perVehicleValue.toFixed(1)} g/veh`

    return {
      key,
      value: totalImpact,
      perVehicleValue,
      secondaryText,
      totalImpact,
    }
  })

  return {
    label: kind === 'fuel' ? 'Fuel Wasted (Idle)' : 'CO2 Emissions (Idle)',
    unit,
    rows,
    potentialCarbonCreditInr,
  }
}
