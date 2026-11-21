"""Candidate generation for the scan flow: cache check + parallel fetch + dedupe + upsert.

`get_candidates(lat, lng)` returns the Place rows near a point, sorted by
distance from it. It doesn't apply the heading filter (that runs on every
request, in geo.py) and never calls the LLM.

Caching works on a grid: lat/lng rounded to 3 decimals (~110m x 80m cells in
Boston). On a miss we search around the cell's center, not the user's exact
position, so every request in the same cell gets the same cached candidates.

If one source fails we still return what the other gave us, but we don't save
the cache entry, so the next request in that cell tries again instead of being
stuck with half the results for 7 days.
"""

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from difflib import SequenceMatcher

from django.db import transaction
from django.utils import timezone

from ..geo import distance_m
from ..models import NearbySearchCache, Place
from . import google_places, wiki
from .http import ExternalAPIError

logger = logging.getLogger(__name__)

CACHE_TTL = timedelta(days=7)

# A Wikipedia article and a Google place are treated as the same thing when their
# names match and they're within this distance of each other.
DEDUPE_MAX_DISTANCE_M = 120
DEDUPE_MIN_NAME_RATIO = 0.85

# Fields from a search result that are safe to overwrite on an existing Place.
# Details fields (rating, hours, ...) and wiki_summary are never touched here.
BASIC_FIELDS = ('source', 'name', 'address', 'lat', 'lng', 'types', 'raw_data')


def grid_key(lat, lng):
    """Cache key for the grid cell containing (lat, lng), e.g. "42.358,-71.057"."""
    # `+ 0.0` turns -0.0 into 0.0 so the key is stable around the equator/meridian.
    return f'{round(lat, 3) + 0.0:.3f},{round(lng, 3) + 0.0:.3f}'


def get_candidates(lat, lng):
    """Places near (lat, lng), closest first. Never raises for upstream failures."""
    start = time.monotonic()
    key = grid_key(lat, lng)

    cache = NearbySearchCache.objects.filter(grid_key=key).first()
    if cache and timezone.now() - cache.created_at < CACHE_TTL:
        places = list(cache.places.all())
        logger.info('candidates cache hit %s (%d places) in %.0fms',
                    key, len(places), (time.monotonic() - start) * 1000)
        return _sort_by_distance(places, lat, lng)

    center_lat, center_lng = (float(x) for x in key.split(','))
    google_results, wiki_results, complete = _fetch(center_lat, center_lng)

    merged = dedupe(google_results, wiki_results)
    places = _upsert(merged)
    if complete:
        _save_cache(key, places)

    logger.info('candidates cache miss %s (%d google, %d wiki -> %d places, cached=%s) in %.0fms',
                key, len(google_results), len(wiki_results), len(places), complete,
                (time.monotonic() - start) * 1000)
    return _sort_by_distance(places, lat, lng)


def _fetch(lat, lng):
    """Call Google Nearby Search and Wikipedia geosearch in parallel.

    Returns (google_results, wiki_results, complete) where `complete` is False
    if either call failed.
    """
    with ThreadPoolExecutor(max_workers=2) as pool:
        google_future = pool.submit(google_places.nearby_search, lat, lng)
        wiki_future = pool.submit(wiki.geosearch, lat, lng)
        google_results, google_ok = _result_or_empty(google_future, 'google.nearby')
        wiki_results, wiki_ok = _result_or_empty(wiki_future, 'wiki.geosearch')
    return google_results, wiki_results, google_ok and wiki_ok


def _result_or_empty(future, label):
    try:
        return future.result(), True
    except ExternalAPIError as exc:
        logger.warning('candidates: %s unavailable, continuing without it (%s)', label, exc)
        return [], False


# --- Dedupe ---------------------------------------------------------------

def _normalize_name(name):
    name = name.lower()
    name = re.sub(r'\s*\(.*?\)', '', name)        # "Old State House (Boston)" -> "old state house"
    name = re.sub(r'[^a-z0-9 ]+', ' ', name)
    name = re.sub(r'^the ', '', name.strip())
    return ' '.join(name.split())


def names_match(a, b):
    a, b = _normalize_name(a), _normalize_name(b)
    if not a or not b:
        return False
    if a == b:
        return True
    # "faneuil hall" vs "faneuil hall marketplace"; require a few chars so "park" doesn't match everything.
    shorter, longer = sorted((a, b), key=len)
    if len(shorter) >= 6 and f' {shorter} ' in f' {longer} ':
        return True
    return SequenceMatcher(None, a, b).ratio() >= DEDUPE_MIN_NAME_RATIO


def dedupe(google_results, wiki_results):
    """Merge the two result lists into one list of Place field dicts.

    Google is the primary source. A Wikipedia article that matches a nearby
    Google place is folded into it (its title goes into `wiki_title` so the card
    can fetch the summary later) instead of becoming its own row. Duplicates
    within each list (same external_id) are also dropped.
    """
    merged = {}
    for item in google_results:
        merged.setdefault(item['external_id'], dict(item))

    google_items = list(merged.values())
    for article in wiki_results:
        match = _find_match(article, google_items)
        if match is not None:
            match.setdefault('wiki_title', article['wiki_title'])
        else:
            merged.setdefault(article['external_id'], dict(article))
    return list(merged.values())


def _find_match(article, google_items):
    best, best_dist = None, None
    for item in google_items:
        if 'wiki_title' in item or not names_match(article['name'], item['name']):
            continue
        dist = distance_m(article['lat'], article['lng'], item['lat'], item['lng'])
        if dist <= DEDUPE_MAX_DISTANCE_M and (best_dist is None or dist < best_dist):
            best, best_dist = item, dist
    return best


# --- DB writes ------------------------------------------------------------

@transaction.atomic
def _upsert(items):
    """Create or update a Place per item, keyed on external_id. Returns the Places."""
    places = []
    for item in items:
        defaults = {field: item[field] for field in BASIC_FIELDS}
        if item.get('wiki_title'):
            defaults['wiki_title'] = item['wiki_title']
        place, _ = Place.objects.update_or_create(external_id=item['external_id'], defaults=defaults)
        places.append(place)
    return places


@transaction.atomic
def _save_cache(key, places):
    cache, created = NearbySearchCache.objects.get_or_create(grid_key=key)
    if not created:
        # Refreshing an expired entry. created_at is auto_now_add, which only
        # applies on insert, so bump it by hand.
        cache.created_at = timezone.now()
        cache.save(update_fields=['created_at'])
    cache.places.set(places)


def _sort_by_distance(places, lat, lng):
    return sorted(places, key=lambda p: distance_m(lat, lng, p.lat, p.lng))
