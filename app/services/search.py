"""The search flow behind GET /api/places/search/: cache check + text search + upsert.

The cache is keyed on the normalized query only (lowercased, trimmed,
collapsed spaces), not on the user's location. The location only biases the
Google call on a miss, which is fine for a Boston-only app.

Results keep Google's relevance order. A many-to-many doesn't store order, so
we insert the through rows ourselves in rank order and read them back ordered
by their auto-increment id.

Failures:
- Google fails, and we have an expired cache entry -> serve the stale results
- Google fails, no cache entry                      -> raise ExternalAPIError (view returns 502)
"""

import logging
import time
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from ..models import TextSearchCache
from . import google_places
from .candidates import upsert_places
from .http import ExternalAPIError

logger = logging.getLogger(__name__)

CACHE_TTL = timedelta(days=7)
MAX_RESULTS = 10

Through = TextSearchCache.places.through


def normalize_query(query):
    """"  Faneuil   HALL " -> "faneuil hall"."""
    return ' '.join(query.lower().split())


def search_places(query, lat=None, lng=None):
    """Places matching `query`, most relevant first.

    Raises ExternalAPIError only if Google fails and there's nothing cached.
    """
    start = time.monotonic()
    key = normalize_query(query)

    cache = TextSearchCache.objects.filter(query=key).first()
    if cache and timezone.now() - cache.created_at < CACHE_TTL:
        places = _cached_places(cache)
        logger.info('search cache hit %r (%d places) in %.0fms',
                    key, len(places), (time.monotonic() - start) * 1000)
        return places

    try:
        results = google_places.text_search(key, lat, lng, max_results=MAX_RESULTS)
    except ExternalAPIError:
        if cache:
            logger.warning('search: google failed, serving stale cache for %r', key)
            return _cached_places(cache)
        raise

    places = upsert_places(_dedupe(results))
    _save_cache(key, places)
    logger.info('search cache miss %r (%d places) in %.0fms',
                key, len(places), (time.monotonic() - start) * 1000)
    return places


def _dedupe(results):
    seen, out = set(), []
    for item in results:
        if item['external_id'] not in seen:
            seen.add(item['external_id'])
            out.append(item)
    return out


def _cached_places(cache):
    rows = Through.objects.filter(textsearchcache=cache).select_related('place').order_by('id')
    return [row.place for row in rows]


@transaction.atomic
def _save_cache(key, places):
    cache, created = TextSearchCache.objects.get_or_create(query=key)
    if not created:
        # Refreshing an expired entry; created_at is auto_now_add, so bump it by hand.
        cache.created_at = timezone.now()
        cache.save(update_fields=['created_at'])
        Through.objects.filter(textsearchcache=cache).delete()
    Through.objects.bulk_create(Through(textsearchcache=cache, place=p) for p in places)
