"""
Builds SUMO network and route files from SimulationConfig.
Supports: built-in templates, OSMnx import, uploaded .net.xml.
"""
import os
import tempfile
import xml.etree.ElementTree as ET
from typing import Tuple
from backend.config import SimulationConfig


TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "templates")


class IntersectionBuilder:
    """
    Generates SUMO .net.xml and .rou.xml from SimulationConfig.
    Returns (net_file_path, rou_file_path).
    """

    def __init__(self, config: SimulationConfig, output_dir: str = None):
        self.config = config
        self.output_dir = output_dir or tempfile.mkdtemp(prefix="tso_sim_")

    def build(self) -> Tuple[str, str]:
        """Build and return (net_file, rou_file) paths."""
        if self.config.network_source == "builtin":
            net_file = self._copy_template()
        elif self.config.network_source == "osm":
            net_file = self._import_from_osm()
        else:
            raise ValueError(f"Unsupported network_source: {self.config.network_source!r}")

        rou_file = self._write_route_stub(net_file)
        return net_file, rou_file

    def _copy_template(self) -> str:
        """Copy the matching built-in .net.xml template to output_dir."""
        template_map = {
            "4way_cross": "4way_cross.net.xml",
            "four_way": "4way_cross.net.xml",
            "four_way_free_left": "four_way_free_left.net.xml",
            "t_junction": "t_junction.net.xml",
            "t_junction_free_left": "t_junction_free_left.net.xml",
            "y_junction": "y_junction.net.xml",
            "6arm_complex": "6arm_complex.net.xml",
            "six_arm": "6arm_complex.net.xml",
            "roundabout": "roundabout.net.xml",
            "roundabout_free_left": "roundabout_free_left.net.xml",
        }
        filename = template_map.get(self.config.intersection_type)
        if not filename:
            raise ValueError(f"Unknown intersection_type: {self.config.intersection_type!r}")

        src = os.path.join(TEMPLATES_DIR, filename)
        dst = os.path.join(self.output_dir, "intersection.net.xml")

        if not os.path.isfile(src):
            # Generate a minimal placeholder if template file absent
            self._write_minimal_net(dst)
        else:
            import shutil
            shutil.copy(src, dst)

        return dst

    def _import_from_osm(self) -> str:
        """Import real-world intersection from OpenStreetMap via OSMnx + netconvert."""
        try:
            import osmnx as ox
        except ImportError:
            raise ImportError("osmnx is required for OSM import: pip install osmnx")

        lat, lon = self.config.osm_lat, self.config.osm_lon
        radius = 200  # metres around the intersection
        osm_file = os.path.join(self.output_dir, "osm_raw.osm")
        net_file = os.path.join(self.output_dir, "intersection.net.xml")

        G = ox.graph_from_point((lat, lon), dist=radius, network_type="drive")
        ox.save_graph_xml(G, filepath=osm_file)

        import subprocess
        subprocess.run([
            "netconvert",
            "--osm-files", osm_file,
            "--output-file", net_file,
            "--geometry.remove", "--roundabouts.guess",
            "--ramps.guess", "--junctions.join",
            "--tls.guess-signals", "--tls.discard-simple",
        ], check=True, capture_output=True)

        return net_file

    def _write_minimal_net(self, path: str) -> None:
        """Write a minimal valid 4-way SUMO network for testing/fallback."""
        content = '''<?xml version="1.0" encoding="UTF-8"?>
<net version="1.9" junctionCornerDetail="5" limitTurnSpeed="5.50">
    <location netOffset="0.00,0.00" convBoundary="-100.00,-100.00,100.00,100.00"
              origBoundary="-100,-100,100,100" projParameter="!"/>
    <!-- Minimal 4-way intersection placeholder -->
    <!-- Full template files should be placed in simulation/templates/ -->
    <junction id="center" type="traffic_light" x="0.00" y="0.00"
              incLanes="" intLanes="" shape=""/>
    <tlLogic id="center" type="static" programID="0" offset="0">
        <phase duration="30" state="GGGGrrrrGGGGrrrr"/>
        <phase duration="4"  state="yyyyrrrryyyyrrrr"/>
        <phase duration="30" state="rrrrGGGGrrrrGGGG"/>
        <phase duration="4"  state="rrrryyyyrrrryyyy"/>
    </tlLogic>
</net>'''
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

    def _write_route_stub(self, net_file: str) -> str:
        """Write minimal .rou.xml stub - demand_generator fills this properly."""
        rou_file = os.path.join(self.output_dir, "routes.rou.xml")
        content = '<?xml version="1.0" encoding="UTF-8"?>\n<routes>\n    <!-- Vehicle type definitions - populated by demand_generator.py -->\n</routes>\n'
        with open(rou_file, "w", encoding="utf-8") as f:
            f.write(content)
        return rou_file

    @staticmethod
    def get_tl_id_from_net(net_file: str) -> str:
        """Parse net XML to find the first traffic light junction ID."""
        tree = ET.parse(net_file)
        root = tree.getroot()
        for junction in root.findall("junction"):
            if junction.get("type") == "traffic_light":
                return junction.get("id", "center")
        return "center"
