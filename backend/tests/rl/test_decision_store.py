"""Tests for DecisionStore — thread-safe in-memory decision log."""
import threading
import pytest


def test_append_and_get_episode():
    from backend.rl.decision_store import DecisionStore
    store = DecisionStore()
    store.append("sess1", 1, {"step": 1, "action": {"phase_name": "N+S Green"}})
    store.append("sess1", 1, {"step": 2, "action": {"phase_name": "E+W Green"}})
    ep = store.get_episode("sess1", 1)
    assert ep is not None
    assert len(ep["decisions"]) == 2
    assert ep["decisions"][0]["step"] == 1


def test_finalise_episode():
    from backend.rl.decision_store import DecisionStore
    store = DecisionStore()
    store.append("sess1", 1, {"step": 1})
    store.finalise_episode("sess1", 1, {"total_reward": -127.3, "mean_wait": 230.0})
    ep = store.get_episode("sess1", 1)
    assert ep["summary"]["total_reward"] == -127.3


def test_get_episodes_summary():
    from backend.rl.decision_store import DecisionStore
    store = DecisionStore()
    store.finalise_episode("sess1", 1, {"total_reward": -100.0, "mean_wait": 200.0, "throughput": 9000})
    store.finalise_episode("sess1", 2, {"total_reward": -80.0,  "mean_wait": 180.0, "throughput": 9200})
    eps = store.get_episodes("sess1")
    assert len(eps) == 2
    assert eps[0]["ep"] == 1
    assert eps[1]["ep"] == 2


def test_get_episode_not_found():
    from backend.rl.decision_store import DecisionStore
    store = DecisionStore()
    assert store.get_episode("no_session", 99) is None


def test_clear_session():
    from backend.rl.decision_store import DecisionStore
    store = DecisionStore()
    store.append("sess1", 1, {"step": 1})
    store.clear("sess1")
    assert store.get_episode("sess1", 1) is None


def test_thread_safety():
    from backend.rl.decision_store import DecisionStore
    store = DecisionStore()
    errors = []

    def _writer(ep_num):
        try:
            for step in range(20):
                store.append("sess_thread", ep_num, {"step": step})
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=_writer, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors, f"Thread errors: {errors}"
