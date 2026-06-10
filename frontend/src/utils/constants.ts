export const MODEL_METADATA: Record<string, { label: string; desc: string; color: string; indicatorColor: string }> = {
  baseline: { label: 'Baseline', desc: 'Pre-timed cycles', color: '#b6a27d', indicatorColor: 'bg-amber-400' },
  rl1:      { label: 'RL Agent 1 (PPO)', desc: 'Adaptive green, min=8s max=35s', color: '#8fb8ce', indicatorColor: 'bg-sky-400' },
  rl2:      { label: 'RL Agent 2 (DQN)', desc: 'Aggressive active, min=6s max=30s', color: '#9fa8c6', indicatorColor: 'bg-indigo-300' },
  rl3:      { label: 'RL Agent 3 (SAC)', desc: 'Cautious holds, min=10s max=40s', color: '#97b9a7', indicatorColor: 'bg-emerald-300' },
  rl4:      { label: 'RL Agent 4 (A2C)', desc: 'Balanced response, min=5s max=25s', color: '#b8a2a2', indicatorColor: 'bg-rose-300' },
  custom:   { label: 'Custom Agent', desc: 'User-defined parameters & sliders', color: '#a6aec2', indicatorColor: 'bg-slate-300' },
}
