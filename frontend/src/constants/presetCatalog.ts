import type { PresetSummary } from '../types'

export const PRESET_GROUP_LABELS: Record<string, string> = {
  A_time_of_day: 'Time of Day',
  B_location: 'Hyderabad Locations',
  C_vehicle_mix: 'Vehicle Mix',
  D_seasonal: 'Seasonal',
  E_events: 'Events',
  F_adverse: 'Adverse Scenarios',
  G_research: 'Research',
}

export const PRESET_GROUP_ORDER = [
  'A_time_of_day',
  'B_location',
  'C_vehicle_mix',
  'D_seasonal',
  'E_events',
  'F_adverse',
  'G_research',
] as const

export const FALLBACK_PRESETS: PresetSummary[] = [
  { id: 'hyd_rush_am', name: 'Hyderabad AM Rush Hour', group: 'A_time_of_day', description: '', tags: [] },
  { id: 'hyd_rush_pm', name: 'Hyderabad PM Rush Hour', group: 'A_time_of_day', description: '', tags: [] },
  { id: 'hyd_normal', name: 'Hyderabad Normal Hour', group: 'A_time_of_day', description: '', tags: [] },
  { id: 'hyd_night', name: 'Hyderabad Night', group: 'A_time_of_day', description: '', tags: [] },
  { id: 'hyd_midnight', name: 'Hyderabad Midnight', group: 'A_time_of_day', description: '', tags: [] },
  { id: 'hyd_weekend', name: 'Hyderabad Weekend', group: 'A_time_of_day', description: '', tags: [] },
  { id: 'hyd_early_morning', name: 'Hyderabad Early Morning', group: 'A_time_of_day', description: '', tags: [] },

  { id: 'hyd_hitec_city', name: 'HITEC City IT Corridor', group: 'B_location', description: '', tags: [] },
  { id: 'hyd_old_city', name: 'Old City - Charminar Area', group: 'B_location', description: '', tags: [] },
  { id: 'hyd_sr_nagar', name: 'SR Nagar - Residential School Zone', group: 'B_location', description: '', tags: [] },
  { id: 'hyd_lb_nagar', name: 'LB Nagar - Outer Ring Road', group: 'B_location', description: '', tags: [] },
  { id: 'hyd_secunderabad', name: 'Secunderabad - Rail Commuter Hub', group: 'B_location', description: '', tags: [] },
  { id: 'hyd_gachibowli', name: 'Gachibowli - IT Area', group: 'B_location', description: '', tags: [] },

  { id: 'mix_ev_dominated', name: 'EV-Dominated Mix', group: 'C_vehicle_mix', description: '', tags: [] },
  { id: 'mix_heavy_vehicles', name: 'Heavy Vehicle Mix', group: 'C_vehicle_mix', description: '', tags: [] },
  { id: 'mix_two_wheelers', name: 'Two-Wheeler Dominated', group: 'C_vehicle_mix', description: '', tags: [] },
  { id: 'mix_cars_only', name: 'Car-Dominated (Western Suburb)', group: 'C_vehicle_mix', description: '', tags: [] },
  { id: 'mix_bus_priority', name: 'Bus Priority Corridor', group: 'C_vehicle_mix', description: '', tags: [] },

  { id: 'season_monsoon', name: 'Monsoon Season (Jun-Sep)', group: 'D_seasonal', description: '', tags: [] },
  { id: 'season_summer', name: 'Summer - Peak Heat (Mar-May)', group: 'D_seasonal', description: '', tags: [] },
  { id: 'season_winter_fog', name: 'Winter Fog (Jan-Feb)', group: 'D_seasonal', description: '', tags: [] },
  { id: 'season_festival', name: 'Festival Season (Diwali/Dussehra)', group: 'D_seasonal', description: '', tags: [] },

  { id: 'event_cricket_match', name: 'Cricket Match Day', group: 'E_events', description: '', tags: [] },
  { id: 'event_political_rally', name: 'Political Rally / VIP Convoy', group: 'E_events', description: '', tags: [] },
  { id: 'event_school_exam', name: 'School Exam Rush', group: 'E_events', description: '', tags: [] },
  { id: 'event_market_day', name: 'Weekly Market Day', group: 'E_events', description: '', tags: [] },

  { id: 'adverse_high_collision', name: 'High Collision Risk', group: 'F_adverse', description: '', tags: [] },
  { id: 'adverse_signal_failure', name: 'Signal Failure - Stuck Red', group: 'F_adverse', description: '', tags: [] },
  { id: 'adverse_heavy_rain', name: 'Heavy Rain + Waterlogging', group: 'F_adverse', description: '', tags: [] },
  { id: 'adverse_vip_convoy', name: 'VIP Convoy - High Severity', group: 'F_adverse', description: '', tags: [] },

  { id: 'research_stress_test', name: 'Research - Stress Test', group: 'G_research', description: '', tags: [] },
  { id: 'research_minimal', name: 'Research - Minimal / Ideal', group: 'G_research', description: '', tags: [] },
  { id: 'research_5arm', name: 'Research - 6-Arm Complex Intersection', group: 'G_research', description: '', tags: [] },
  { id: 'research_roundabout', name: 'Research - Roundabout', group: 'G_research', description: '', tags: [] },
]
