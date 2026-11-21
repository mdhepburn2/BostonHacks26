"""MBTA V3 API: the nearest subway / light rail stop to a point.

Two calls: /stops sorted by distance to find the closest platform, then
/routes for its parent station to get the lines. Like the other services this
doesn't touch the database and raises ExternalAPIError on failure.

Only "T" lines count (route types 0 = light rail and 1 = subway), so buses
and commuter rail are ignored.
"""

import math

from django.conf import settings

from ..geo import distance_m
from .http import ExternalAPIError, request_json

BASE_URL = 'https://api-v3.mbta.com'

T_ROUTE_TYPES = '0,1'

# filter[radius] is in degrees; 0.02 is about 2km north-south in Boston.
SEARCH_RADIUS_DEG = 0.02

# Straight-line distance undercounts real walking routes, so pad it a bit.
WALK_METERS_PER_MIN = 80
WALK_DETOUR_FACTOR = 1.3


def _headers():
    # The API works without a key (at a lower rate limit), so only send it if set.
    return {'x-api-key': settings.MBTA_KEY} if settings.MBTA_KEY else {}


def nearest_stop(lat, lng):
    """{"stop": name, "lines": [...], "walk_min": int} for the closest T stop, or None if none is nearby."""
    data = request_json(
        'GET', f'{BASE_URL}/stops', label='mbta.stops', headers=_headers(),
        params={
            'filter[latitude]': lat,
            'filter[longitude]': lng,
            'filter[radius]': SEARCH_RADIUS_DEG,
            'filter[route_type]': T_ROUTE_TYPES,
            'sort': 'distance',
            'page[limit]': 1,
            'fields[stop]': 'name,latitude,longitude',
        },
    )
    stops = data.get('data') or []
    if not stops:
        return None

    try:
        stop = stops[0]
        attrs = stop['attributes']
        parent = ((stop.get('relationships') or {}).get('parent_station') or {}).get('data') or {}
        station_id = parent.get('id') or stop['id']
        name = attrs['name']
        meters = distance_m(lat, lng, float(attrs['latitude']), float(attrs['longitude']))
    except (KeyError, TypeError, ValueError) as exc:
        raise ExternalAPIError(f'mbta.stops returned an unexpected shape: {str(stops[0])[:200]}') from exc

    return {'stop': name, 'lines': lines_for_station(station_id), 'walk_min': walk_minutes(meters)}


def lines_for_station(station_id):
    """T lines at a station, e.g. ["Red", "Green"]. Green-B/C/D/E collapse into "Green"."""
    data = request_json(
        'GET', f'{BASE_URL}/routes', label='mbta.routes', headers=_headers(),
        params={'filter[stop]': station_id, 'filter[type]': T_ROUTE_TYPES, 'fields[route]': 'long_name'},
    )
    lines = []
    for route in data.get('data') or []:
        line = str(route.get('id', '')).split('-')[0]
        if line and line not in lines:
            lines.append(line)
    return lines


def walk_minutes(meters):
    return max(1, math.ceil(meters * WALK_DETOUR_FACTOR / WALK_METERS_PER_MIN))
