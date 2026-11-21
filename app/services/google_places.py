"""Google Places API (New): nearby search, text search and place details.

These functions only talk to Google and normalize the response. They don't
touch the database; caching and upserting happen in the callers
(candidates.py for scan, the search/card code for the other flows).

Billing depends on the fields requested, so every call sends an
X-Goog-FieldMask with only what that call needs. Rating, price level and
hours are a pricier tier, so they are only requested by `place_details`,
which should only run when a place card is opened.

All functions raise ExternalAPIError on failure (including a missing key).
"""

from django.conf import settings

from .http import ExternalAPIError, request_json

BASE_URL = 'https://places.googleapis.com/v1'

NEARBY_RADIUS_M = 150
TEXT_SEARCH_BIAS_RADIUS_M = 5000
BOSTON_CENTER = (42.3601, -71.0589)

# Fields for nearby and text search: just enough to build a Place row.
SEARCH_FIELDS = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.types',
    'places.primaryType',
]

# Fields for the place card. These bill at a higher tier.
DETAILS_FIELDS = [
    'rating',
    'userRatingCount',
    'priceLevel',
    'regularOpeningHours.weekdayDescriptions',
]

PRICE_RANGES = {
    'PRICE_LEVEL_INEXPENSIVE': '$',
    'PRICE_LEVEL_MODERATE': '$$',
    'PRICE_LEVEL_EXPENSIVE': '$$$',
    'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$',
}


def _headers(fields):
    key = settings.GOOGLE_PLACES_KEY
    if not key:
        raise ExternalAPIError('GOOGLE_PLACES_KEY is not set')
    return {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': ','.join(fields),
        'Content-Type': 'application/json',
    }


def _circle(lat, lng, radius):
    return {'circle': {'center': {'latitude': lat, 'longitude': lng}, 'radius': radius}}


def _normalize(place):
    """Turn a Places API place into a dict of Place model fields."""
    location = place.get('location') or {}
    return {
        'external_id': place['id'],
        'source': 'google',
        'name': (place.get('displayName') or {}).get('text', ''),
        'address': place.get('formattedAddress', ''),
        'lat': location.get('latitude'),
        'lng': location.get('longitude'),
        'types': place.get('types', []),
        'raw_data': place,
    }


def _normalize_list(data):
    results = []
    for place in data.get('places', []):
        item = _normalize(place)
        if item['external_id'] and item['name'] and item['lat'] is not None and item['lng'] is not None:
            results.append(item)
    return results


def nearby_search(lat, lng, radius=NEARBY_RADIUS_M, max_results=20):
    """Places within `radius` meters of (lat, lng), closest first."""
    body = {
        'locationRestriction': _circle(lat, lng, radius),
        'maxResultCount': max_results,
        'rankPreference': 'DISTANCE',
    }
    data = request_json(
        'POST', f'{BASE_URL}/places:searchNearby',
        label='google.nearby', headers=_headers(SEARCH_FIELDS), json=body,
    )
    return _normalize_list(data)


def text_search(query, lat=None, lng=None, max_results=10):
    """Places matching `query`, biased toward (lat, lng) or the center of Boston."""
    if lat is None or lng is None:
        lat, lng = BOSTON_CENTER
    body = {
        'textQuery': query,
        'locationBias': _circle(lat, lng, TEXT_SEARCH_BIAS_RADIUS_M),
        'pageSize': max_results,
    }
    data = request_json(
        'POST', f'{BASE_URL}/places:searchText',
        label='google.text_search', headers=_headers(SEARCH_FIELDS), json=body,
    )
    return _normalize_list(data)


def place_details(place_id):
    """Rating, rating count, price level and opening hours for one Google place.

    Missing fields come back as None (common for landmarks).
    """
    data = request_json(
        'GET', f'{BASE_URL}/places/{place_id}',
        label='google.details', headers=_headers(DETAILS_FIELDS),
    )
    hours = (data.get('regularOpeningHours') or {}).get('weekdayDescriptions')
    return {
        'rating': data.get('rating'),
        'rating_count': data.get('userRatingCount'),
        'price_level': data.get('priceLevel'),
        'opening_hours': hours or None,
    }


def price_range(price_level):
    """Map Google's price level enum to "$" through "$$$$", or None."""
    return PRICE_RANGES.get(price_level)
