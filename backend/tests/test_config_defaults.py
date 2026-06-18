from __future__ import annotations


def test_simulation_config_defaults_use_larger_mlp_and_more_epochs():
    """Project defaults should reflect the 128x128 / 250-epoch baseline."""
    from backend.config import SimulationConfig

    cfg = SimulationConfig()
    assert cfg.hidden_layer_size == 128
    assert cfg.ppo_epochs == 250
