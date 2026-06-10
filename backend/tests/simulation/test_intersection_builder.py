"""Tests for IntersectionBuilder."""
import os
import pytest
import tempfile
from backend.config import SimulationConfig
from backend.simulation.intersection_builder import IntersectionBuilder


@pytest.fixture
def tmp_output(tmp_path):
    return str(tmp_path)


def test_build_4way_cross(tmp_output):
    config = SimulationConfig(intersection_type="4way_cross", network_source="builtin")
    builder = IntersectionBuilder(config, output_dir=tmp_output)
    net_file, rou_file = builder.build()
    assert os.path.isfile(net_file)
    assert os.path.isfile(rou_file)


def test_build_t_junction(tmp_output):
    config = SimulationConfig(intersection_type="t_junction", network_source="builtin")
    builder = IntersectionBuilder(config, output_dir=tmp_output)
    net_file, _ = builder.build()
    assert os.path.isfile(net_file)


def test_build_roundabout(tmp_output):
    config = SimulationConfig(intersection_type="roundabout", network_source="builtin")
    builder = IntersectionBuilder(config, output_dir=tmp_output)
    net_file, _ = builder.build()
    assert os.path.isfile(net_file)


def test_invalid_intersection_type(tmp_output):
    config = SimulationConfig(intersection_type="invalid_type", network_source="builtin")
    builder = IntersectionBuilder(config, output_dir=tmp_output)
    with pytest.raises(ValueError, match="Unknown intersection_type"):
        builder.build()


def test_get_tl_id_from_net(tmp_output):
    config = SimulationConfig(network_source="builtin")
    builder = IntersectionBuilder(config, output_dir=tmp_output)
    net_file, _ = builder.build()
    tl_id = IntersectionBuilder.get_tl_id_from_net(net_file)
    assert isinstance(tl_id, str)
    assert len(tl_id) > 0


def test_route_stub_is_valid_xml(tmp_output):
    config = SimulationConfig(network_source="builtin")
    builder = IntersectionBuilder(config, output_dir=tmp_output)
    _, rou_file = builder.build()
    import xml.etree.ElementTree as ET
    tree = ET.parse(rou_file)
    assert tree.getroot().tag == "routes"
