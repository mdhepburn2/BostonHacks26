"""Geometry helpers: distance, bearing and the scan flow's heading filter."""

import math

EARTH_RADIUS_M = 6_371_000

# Heading filter settings (see filter_by_heading).
HEADING_TOLERANCE_DEG = 45
MAX_CANDIDATES = 8
# Places this close are kept whatever the heading: at this range GPS error is
# about the same size as the distance, so the bearing to them is mostly noise.
ALWAYS_KEEP_WITHIN_M = 20


def distance_m(lat1, lng1, lat2, lng2):
    """Haversine distance in meters between two points."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def bearing_deg(lat1, lng1, lat2, lng2):
    """Initial compass bearing from point 1 to point 2, in degrees [0, 360). 0 = north, 90 = east."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lng2 - lng1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return math.degrees(math.atan2(x, y)) % 360


def angle_diff_deg(a, b):
    """Smallest difference between two compass angles, in degrees [0, 180]."""
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def filter_by_heading(places, lat, lng, heading, tolerance=HEADING_TOLERANCE_DEG,
                      max_results=MAX_CANDIDATES):
    """Narrow scan candidates to the ones the user is facing.

    `places` is any iterable of objects with `.lat` and `.lng` (Place rows).
    Keeps places within ±`tolerance` degrees of `heading`, plus anything within
    ALWAYS_KEEP_WITHIN_M, sorted by distance and capped at `max_results`.

    Falls back to all places sorted by distance (same cap) when no heading was
    sent or nothing survives the filter, so the LLM always has something to
    pick from.
    """
    by_distance = sorted(places, key=lambda p: distance_m(lat, lng, p.lat, p.lng))
    if heading is None:
        return by_distance[:max_results]

    heading = heading % 360
    facing = [
        p for p in by_distance
        if distance_m(lat, lng, p.lat, p.lng) <= ALWAYS_KEEP_WITHIN_M
        or angle_diff_deg(bearing_deg(lat, lng, p.lat, p.lng), heading) <= tolerance
    ]
    return (facing or by_distance)[:max_results]
