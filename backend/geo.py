"""Geographic helpers — haversine distance and ZIP centroid lookup."""

import csv
import math
from pathlib import Path

EARTH_RADIUS_MILES = 3959

# {zip_code: (lat, lng)}
_CENTROIDS: dict[str, tuple[float, float]] = {}


def load_centroids(data_dir: str | Path) -> dict[str, tuple[float, float]]:
    """Load zip_centroids.csv into memory. Idempotent — returns cached dict."""
    global _CENTROIDS
    if _CENTROIDS:
        return _CENTROIDS
    path = Path(data_dir) / "zip_centroids.csv"
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            _CENTROIDS[row["zip"]] = (float(row["lat"]), float(row["lng"]))
    return _CENTROIDS


def miles_between(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine distance in miles between two lat/lng points."""
    lat1, lng1, lat2, lng2 = (math.radians(v) for v in (lat1, lng1, lat2, lng2))
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_MILES * math.asin(math.sqrt(a))


def neighbors_within(zip_code: str, radius_miles: float,
                     centroids: dict[str, tuple[float, float]] | None = None) -> list[str]:
    """Return all ZIP codes within radius_miles of the given ZIP code."""
    c = centroids or _CENTROIDS
    if zip_code not in c:
        return []
    lat1, lng1 = c[zip_code]
    result = []
    for z, (lat2, lng2) in c.items():
        if z == zip_code:
            continue
        if miles_between(lat1, lng1, lat2, lng2) <= radius_miles:
            result.append(z)
    return result
