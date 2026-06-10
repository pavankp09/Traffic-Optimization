"""
Multi-seed evaluation harness for the mock_env reward function.

Why this exists
---------------
KPIs (wait, throughput) shift a lot between random seeds — enough that a single
run can make a reward change look better or worse than it really is. This script
trains a PPO agent on mock_env across several seeds with a fixed budget, then
evaluates the learned policy against the fixed-time baseline under matched
conditions, and reports the AVERAGED improvement. Run it before and after any
reward change to know whether the change actually helped.

Usage
-----
    python -m backend.rl.eval_reward                  # defaults
    python -m backend.rl.eval_reward --seeds 0 1 2 3  # more seeds = less noise
    python -m backend.rl.eval_reward --timesteps 80000 --eval-episodes 20

It deliberately bypasses PPOTrainer's DB/Socket machinery and builds PPO
directly on make_mock_env, so it measures the env reward in isolation.
"""
from __future__ import annotations

import argparse
import statistics
from typing import List, Tuple

import numpy as np
from stable_baselines3 import PPO

from backend.config import SimulationConfig, AdverseConfig
from backend.rl.mock_env import make_mock_env, run_fixed_time_baseline


def _build_ppo(env, seed: int) -> PPO:
    """Mirror the PPO hyperparameters used by PPOTrainer._build_model."""
    return PPO(
        policy="MlpPolicy",
        env=env,
        learning_rate=3e-4,
        n_steps=2048,
        batch_size=64,
        n_epochs=10,
        gamma=0.99,
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.01,
        vf_coef=0.5,
        max_grad_norm=0.5,
        policy_kwargs={"net_arch": [64, 64]},
        verbose=0,
        seed=seed,
    )


def _evaluate_policy(
    model: PPO,
    sim_config: SimulationConfig,
    seed: int,
    n_eval_episodes: int,
) -> Tuple[float, float]:
    """Run the trained policy deterministically; return (mean_wait, mean_throughput)."""
    env = make_mock_env(sim_config, seed=seed)
    waits: List[float] = []
    tputs: List[float] = []
    for ep in range(n_eval_episodes):
        obs, _ = env.reset(seed=seed + ep * 1000)
        info: dict = {}
        done = False
        while not done:
            action, _ = model.predict(obs, deterministic=True)
            obs, _, terminated, truncated, info = env.step(int(action))
            done = terminated or truncated
        waits.append(float(info.get("mean_wait", 0.0)))
        tputs.append(float(info.get("throughput", 0)))
    return statistics.mean(waits), statistics.mean(tputs)


def _evaluate_baseline(
    sim_config: SimulationConfig,
    seed: int,
    n_eval_episodes: int,
) -> Tuple[float, float]:
    """Average the fixed-time baseline over the same eval seeds."""
    waits: List[float] = []
    tputs: List[float] = []
    for ep in range(n_eval_episodes):
        base = run_fixed_time_baseline(sim_config, seed=seed + ep * 1000)
        waits.append(float(base["mean_wait"]))
        tputs.append(float(base["throughput"]))
    return statistics.mean(waits), statistics.mean(tputs)


def run_eval(
    seeds: List[int],
    timesteps: int,
    eval_episodes: int,
    sim_config: SimulationConfig | None = None,
) -> dict:
    sim_config = sim_config or SimulationConfig()

    rl_waits: List[float] = []
    rl_tputs: List[float] = []
    bl_waits: List[float] = []
    bl_tputs: List[float] = []

    for seed in seeds:
        train_env = make_mock_env(sim_config, seed=seed)
        model = _build_ppo(train_env, seed=seed)
        model.learn(total_timesteps=timesteps, reset_num_timesteps=True)

        rl_w, rl_t = _evaluate_policy(model, sim_config, seed=seed, n_eval_episodes=eval_episodes)
        bl_w, bl_t = _evaluate_baseline(sim_config, seed=seed, n_eval_episodes=eval_episodes)

        rl_waits.append(rl_w)
        rl_tputs.append(rl_t)
        bl_waits.append(bl_w)
        bl_tputs.append(bl_t)

        wait_imp = (bl_w - rl_w) / bl_w * 100 if bl_w else 0.0
        tput_imp = (rl_t - bl_t) / bl_t * 100 if bl_t else 0.0
        print(
            f"  seed {seed:>3}: "
            f"wait RL={rl_w:6.2f}s vs BL={bl_w:6.2f}s ({wait_imp:+5.1f}%)  |  "
            f"tput RL={rl_t:7.0f} vs BL={bl_t:7.0f} ({tput_imp:+5.1f}%)"
        )

    avg_rl_wait = statistics.mean(rl_waits)
    avg_bl_wait = statistics.mean(bl_waits)
    avg_rl_tput = statistics.mean(rl_tputs)
    avg_bl_tput = statistics.mean(bl_tputs)

    wait_improvement = (avg_bl_wait - avg_rl_wait) / avg_bl_wait * 100 if avg_bl_wait else 0.0
    tput_improvement = (avg_rl_tput - avg_bl_tput) / avg_bl_tput * 100 if avg_bl_tput else 0.0

    return {
        "seeds": seeds,
        "timesteps": timesteps,
        "eval_episodes": eval_episodes,
        "avg_rl_wait": avg_rl_wait,
        "avg_bl_wait": avg_bl_wait,
        "avg_rl_tput": avg_rl_tput,
        "avg_bl_tput": avg_bl_tput,
        "wait_improvement_pct": wait_improvement,
        "tput_improvement_pct": tput_improvement,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate mock_env reward across seeds.")
    parser.add_argument("--seeds", type=int, nargs="+", default=[0, 1, 2],
                        help="Random seeds to average over (more = less noise).")
    parser.add_argument("--timesteps", type=int, default=50_000,
                        help="PPO training timesteps per seed.")
    parser.add_argument("--eval-episodes", type=int, default=10,
                        help="Evaluation episodes per seed for RL and baseline.")
    parser.add_argument("--volume", type=int, default=None,
                        help="Override traffic_volume_vph (use high values to test saturation).")
    args = parser.parse_args()

    sim_config = SimulationConfig()
    if args.volume is not None:
        sim_config.traffic_volume_vph = args.volume

    print(f"Evaluating mock_env reward — seeds={args.seeds} "
          f"timesteps={args.timesteps} eval_episodes={args.eval_episodes} "
          f"volume={sim_config.traffic_volume_vph}")
    result = run_eval(args.seeds, args.timesteps, args.eval_episodes, sim_config=sim_config)

    print("\n" + "=" * 64)
    print("AVERAGED RESULTS")
    print("=" * 64)
    print(f"  Avg wait    : RL {result['avg_rl_wait']:.2f}s  vs  "
          f"baseline {result['avg_bl_wait']:.2f}s   "
          f"=> {result['wait_improvement_pct']:+.1f}% improvement")
    print(f"  Avg tput    : RL {result['avg_rl_tput']:.0f}    vs  "
          f"baseline {result['avg_bl_tput']:.0f}     "
          f"=> {result['tput_improvement_pct']:+.1f}% improvement")
    print("=" * 64)


if __name__ == "__main__":
    main()
