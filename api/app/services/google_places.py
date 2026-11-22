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

# Nearby search only returns 20 places, closest first. Unfiltered, a dense block
# fills all 20 with bus stops, short-term rentals, offices and businesses run out
# of an apartment, and the storefront in the photo gets cut. So scan only asks
# for things people photograph. A place matches if ANY of its types is listed,
# and specific types carry their parent (an indian_restaurant is also a
# restaurant), so broad types cover most of it. Landmarks Google doesn't list
# still come in through the Wikipedia geosearch. Google allows at most 50.
SCAN_TYPES = [
    # Food and drink
    'restaurant', 'cafe', 'coffee_shop', 'bar', 'pub', 'bakery', 'ice_cream_shop', 'dessert_shop',
    'fast_food_restaurant', 'sandwich_shop', 'night_club', 'wine_bar', 'tea_house', 'juice_shop',
    # Shopping
    'store', 'shopping_mall', 'book_store', 'clothing_store', 'convenience_store', 'grocery_store',
    'supermarket', 'market', 'gift_shop', 'pharmacy',
    # Culture, entertainment, landmarks
    'museum', 'art_gallery', 'tourist_attraction', 'historical_landmark', 'historical_place',
    'monument', 'cultural_landmark', 'performing_arts_theater', 'movie_theater', 'live_music_venue',
    'concert_hall', 'comedy_club', 'stadium', 'arena', 'library', 'church', 'park', 'plaza',
    'university',
    # Other storefronts
    'hotel', 'gym', 'hair_salon', 'barber_shop', 'beauty_salon', 'bank',
]

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
    """Turn a Places API place into a dict of Place model fields, or None if it's unusable."""
    if not isinstance(place, dict):
        return None
    location = place.get('location') or {}
    name = (place.get('displayName') or {}).get('text')
    types = place.get('types')
    item = {
        'external_id': place.get('id'),
        'source': 'google',
        'name': name if isinstance(name, str) else '',
        'address': place.get('formattedAddress') if isinstance(place.get('formattedAddress'), str) else '',
        'lat': _number(location.get('latitude')),
        'lng': _number(location.get('longitude')),
        'types': [t for t in types if isinstance(t, str)] if isinstance(types, list) else [],
        'raw_data': place,
    }
    if not isinstance(item['external_id'], str) or not item['external_id'] or not item['name']:
        return None
    if item['lat'] is None or item['lng'] is None:
        return None
    return item


def _normalize_list(data):
    places = data.get('places')
    if not isinstance(places, list):
        return []
    return [item for item in map(_normalize, places) if item is not None]


def _number(value):
    """value as a float, or None if it isn't a number."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def nearby_search(lat, lng, radius=NEARBY_RADIUS_M, max_results=20, included_types=SCAN_TYPES):
    """Places within `radius` meters of (lat, lng), closest first, limited to `included_types`."""
    body = {
        'includedTypes': list(included_types),
        'locationRestriction': _circle(lat, lng, radius),
        'maxResultCount': max_results,
        'rankPreference': 'DISTANCE',
    }
    data = request_json(
        'POST', f'{BASE_URL}/places:searchNearby',
        label='google.nearby', headers=_headers(SEARCH_FIELDS), json=body,
    )
    return _normalize_list(data)


def text_search(query, lat=None, lng=None, max_results=10, bias_radius=TEXT_SEARCH_BIAS_RADIUS_M):
    """Places matching `query`, biased toward (lat, lng) or the center of Boston.

    `bias_radius` is how far around that point to prefer results; the scan
    flow's sign lookup uses a small one so the nearby branch of a chain wins.
    """
    if lat is None or lng is None:
        lat, lng = BOSTON_CENTER
    body = {
        'textQuery': query,
        'locationBias': _circle(lat, lng, bias_radius),
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
    # Anything with the wrong type is treated as missing so it can't break the save.
    hours = (data.get('regularOpeningHours') or {}).get('weekdayDescriptions')
    if not isinstance(hours, list) or not all(isinstance(h, str) for h in hours):
        hours = None
    count = data.get('userRatingCount')
    price = data.get('priceLevel')
    return {
        'rating': _number(data.get('rating')),
        'rating_count': count if isinstance(count, int) and not isinstance(count, bool) else None,
        'price_level': price if isinstance(price, str) else None,
        'opening_hours': hours or None,
    }


def price_range(price_level):
    """Map Google's price level enum to "$" through "$$$$", or None."""
    return PRICE_RANGES.get(price_level)
