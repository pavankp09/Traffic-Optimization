import React, { useState } from 'react'
import HelpPopover from './HelpPopover'
import type { EconomicSummary } from '../types'

interface EconomicProjectorProps {
  economic: EconomicSummary | null
  loading?: boolean
}

function Metric({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 flex flex-col hover:bg-gray-800/80 transition-all">
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <span className="text-xl font-bold font-mono text-emerald-400 mt-1">{value}</span>
      {sublabel && <span className="text-[10px] text-gray-500 font-mono mt-0.5">{sublabel}</span>}
    </div>
  )
}

const VEHICLE_PARAMS = [
  { type: 'Bike / Two-Wheeler', pct: 40, idleFuel: 0.35, occupancy: 1.2, wage: 100, icon: '🏍️' },
  { type: 'Standard Car', pct: 35, idleFuel: 1.2, occupancy: 1.8, wage: 150, icon: '🚗' },
  { type: 'Auto Rickshaw', pct: 15, idleFuel: 0.65, occupancy: 2.5, wage: 80, icon: '🛺' },
  { type: 'TSRTC Bus', pct: 6, idleFuel: 2.4, occupancy: 40.0, wage: 40, icon: '🚌' },
  { type: 'Truck / Heavy', pct: 4, idleFuel: 2.0, occupancy: 1.5, wage: 100, icon: '🚛' },
]

export default function EconomicProjector({ economic, loading }: EconomicProjectorProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-16 bg-gray-800 rounded-lg" />
        ))}
      </div>
    )
  }

  if (!economic) {
    return (
      <div className="text-center text-gray-500 py-8 text-sm">
        Run training to see economic impact
      </div>
    )
  }

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const fmtL = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} L`
  const fmtT = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} t`

  // City-wide calculations based on wait reduction
  const totalAnnualVehHoursSaved = (economic.wait_reduction_s / 3600) * 5000 * 650 * 365

  return (
    <div className="space-y-4">
      
      {/* 🏎️ Per Vehicle Savings */}
      <div>
        <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-2 font-mono flex items-center gap-1">
          Per Vehicle (Hyderabad GHMC)
          <HelpPopover text="### Per Vehicle Savings\nEconomic benefits calculated per vehicle per trip:\n- **Fuel Saved**: Lived fuel idle reduction rate ($0.35$ to $2.4$ L/hr based on class).\n- **CO₂ Avoided**: Carbon reduction factor ($2.31$ kg per liter of fuel saved).\n- **Fuel Cost Saved**: Multiplied at petrol price of **₹105/L**.\n- **Time Value**: Calculated based on occupancy and average hourly wage rates." position="top" />
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Fuel Saved" value={`${economic.fuel_saved_l_per_veh.toFixed(3)} L`} sublabel="per trip" />
          <Metric label="CO₂ Avoided" value={`${economic.co2_avoided_kg_per_veh.toFixed(3)} kg`} sublabel="per trip" />
          <Metric label="Fuel Cost Saved" value={fmt(economic.fuel_cost_saved_inr_per_veh)} sublabel="per trip" />
          <Metric label="Time Value" value={fmt(economic.time_value_saved_inr_per_veh)} sublabel="per trip" />
        </div>
      </div>

      {/* 💼 Fleet Total Savings */}
      <div>
        <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-2 font-mono flex items-center gap-1">
          Simulated Fleet Total
          <HelpPopover text="### Simulated Fleet Total\nTotal savings accumulated across all active vehicles in the simulated environment:\n- **Total Saving**: Sum of fuel cost saved plus traveler time-value saved.\n- **Carbon Credits**: Valued at **₹1500 per metric tonne** of CO₂ avoided." position="top" />
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Metric label="Total Saving" value={fmt(economic.total_saving_inr)} />
          <Metric label="Carbon Credits" value={fmt(economic.carbon_credit_value_inr)} />
          <Metric label="CO₂ Avoided" value={`${economic.total_co2_avoided_kg.toFixed(1)} kg`} />
          <Metric label="Fuel Saved" value={`${economic.total_fuel_saved_l.toFixed(2)} L`} />
        </div>
      </div>

      {/* 🌐 City-Wide Projections */}
      <div>
        <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-2 font-mono flex items-center gap-1">
          City-Wide Annual Projection
          <HelpPopover text="### City-Wide Annual Projection\nScales simulated intersection gains up to city-wide scale:\n- **Annual Saving**: Projected saving across **650 active intersections** in Hyderabad.\n- **Formula**:\n$$\\text{Savings} = T_{\\text{saved}} \\cdot N_{\\text{intersections}} \\cdot \\text{Wage/Fuel Rate} \\cdot 365$$" position="top" />
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <Metric
            label="Annual Saving"
            value={fmt(economic.city_annual_saving_inr)}
            sublabel={`${economic.city_intersections} active intersections`}
          />
          <Metric
            label="CO₂ Avoided"
            value={`${economic.city_annual_co2_avoided_tonne.toFixed(0)} t`}
            sublabel="tonnes/year carbon savings"
          />
        </div>
      </div>

      {/* 🔍 COLLAPSIBLE VEHICLE BREAKDOWN */}
      <div className="border-t border-gray-800 pt-3">
        <button
          type="button"
          className="w-full flex items-center justify-between py-2 text-xs font-extrabold text-cyan-400 hover:text-cyan-300 uppercase tracking-wider font-mono focus:outline-none transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="flex items-center gap-1">
            {isOpen ? '▼ Hide' : '▶ Show'} Vehicle-Specific Parameters & Breakdown
            <HelpPopover text="### Vehicle Parameters Breakdown\nIndividual parameter metrics for standard Hyderabad vehicle mixes:\n- **Two-Wheeler**: 40% mix, 0.35 L/hr idle, ₹100 wage.\n- **Standard Car**: 35% mix, 1.2 L/hr idle, ₹150 wage.\n- **Auto Rickshaw**: 15% mix, 0.65 L/hr idle, ₹80 wage.\n- **TSRTC Bus**: 6% mix, 2.4 L/hr idle, ₹40 wage.\n- **Heavy Truck**: 4% mix, 2.0 L/hr idle, ₹100 wage." position="top" />
          </span>
          <span className="text-[10px] text-gray-500 font-normal normal-case">
            {isOpen ? 'Click to collapse' : 'Click to expand calculations'}
          </span>
        </button>

        {isOpen && (
          <div className="mt-3 space-y-3 bg-gray-950/60 rounded-xl border border-gray-850 p-3 animate-fadeIn">
            <div className="text-[10px] text-gray-400 leading-relaxed font-sans border-b border-gray-900 pb-2">
              💡 **Hyderabad Blended Fleet Economics:** Based on GHMC vehicle distribution model, petrol fuel cost fixed at **₹105/L**, CO₂ emission standard **2.31 kg/L**, and city-wide annual delay saved in vehicle-hours: **{totalAnnualVehHoursSaved.toLocaleString('en-IN', { maximumFractionDigits: 0 })} hours**.
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[10.5px] font-mono leading-relaxed">
                <thead>
                  <tr className="border-b border-gray-900 text-[8px] text-gray-400 uppercase tracking-wider font-extrabold">
                    <th className="py-2 pr-1 font-sans">Vehicle Class</th>
                    <th className="py-2 px-1 text-center">Mix %</th>
                    <th className="py-2 px-1 text-center">Idle Fuel</th>
                    <th className="py-2 px-1 text-center">Pax (Wage)</th>
                    <th className="py-2 pl-1 text-right">CO₂ Avoided</th>
                    <th className="py-2 pl-1 text-right">Fuel Saved</th>
                    <th className="py-2 pl-1 text-right text-emerald-400">Total Savings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-900 text-gray-200">
                  {VEHICLE_PARAMS.map((v) => {
                    const typeHours = totalAnnualVehHoursSaved * (v.pct / 100)
                    const typeFuel = typeHours * v.idleFuel
                    const typeFuelInr = typeFuel * 105
                    const typeTimeInr = typeHours * v.occupancy * v.wage
                    const typeTotalInr = typeFuelInr + typeTimeInr
                    const typeCo2 = typeFuel * 2.31 / 1000

                    return (
                      <tr key={v.type} className="hover:bg-gray-900/30 transition-colors">
                        <td className="py-2 pr-1 font-sans font-bold flex items-center gap-1">
                          <span>{v.icon}</span>
                          <span className="truncate">{v.type}</span>
                        </td>
                        <td className="py-2 px-1 text-center font-bold text-gray-100">{v.pct}%</td>
                        <td className="py-2 px-1 text-center text-gray-400">{v.idleFuel} L/hr</td>
                        <td className="py-2 px-1 text-center text-gray-400">{v.occupancy} (₹{v.wage})</td>
                        <td className="py-2 pl-1 text-right font-bold text-gray-300">{fmtT(typeCo2)}</td>
                        <td className="py-2 pl-1 text-right font-bold text-gray-300">{fmtL(typeFuel)}</td>
                        <td className="py-2 pl-1 text-right font-extrabold text-emerald-400">{fmt(typeTotalInr)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="text-[9px] text-gray-500 mt-1 font-sans italic border-t border-gray-900 pt-2 flex justify-between">
              <span>* Total Savings = Fuel Cost Saved (₹105/L) + Value of Passenger Time Saved</span>
              <span>Blended average</span>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
