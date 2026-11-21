"""The place card flow behind GET /api/places/<id>/.

1. Place details (rating, rating count, price level, hours): fetched from
   Google only when a card is opened, and refreshed after 7 days. Wikipedia-only
   places have no Google id, so they never get details.
2. Card cache (bio + nearest T stop): stored in PlaceCard. On a miss we gather
   facts (stored Place data + Wikipedia summary), have the LLM write the bio and
   save the card. Details, the Wikipedia lookup and the MBTA lookup run in parallel.
   A cached card with no T stop yet (MBTA failed last time, or the card is from
   before step 11) gets one on its next open.
3. `saved` (the requester's SavedPlace) and friends interested are live per
   request. Friends interested is always 0 until step 19.

Failures never crash the request:
- details fail     -> card keeps whatever it had (null rating/price/hours on first open)
- Wikipedia fails  -> bio is written from the Place data alone, but the card is
                      NOT saved, so a later open can write it with the Wikipedia facts
- MBTA fails       -> nearest_t is null, retried on the next open
- no T stop nearby -> stored as {} so we don't ask again; returned as null
- bio fails        -> fallback bio (the Wikipedia summary, or ''), and the card is
                      NOT saved so the next open tries the LLM again
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from django.db import IntegrityError
from django.utils import timezone

from .. import permissions
from ..geo import distance_m
from ..models import Place, PlaceCard
from . import google_places, llm, mbta, wiki
from .candidates import is_subtopic, name_similarity, names_match
from .http import ExternalAPIError, unexpected

logger = logging.getLogger(__name__)

DETAILS_TTL = timedelta(days=7)

# How far from a Google place we look for a Wikipedia article with a matching name.
WIKI_LOOKUP_RADIUS_M = 150

DETAIL_FIELDS = ('rating', 'rating_count', 'price_level', 'opening_hours')

# _fetch_wiki's result when the lookup failed, as opposed to None (no article found).
WIKI_FAILED = object()


def get_card(place, user=None):
    """Build the place card response for `place` as seen by `user`. Never raises for upstream failures."""
    timings = {}
    t = time.monotonic()

    card = PlaceCard.objects.filter(place=place).first()
    need_details = _details_stale(place)
    need_wiki = card is None and not place.wiki_summary
    need_mbta = card is None or card.nearest_t is None

    details = wiki_info = nearest_t = None
    wiki_failed = False
    if need_details or need_wiki or need_mbta:
        with ThreadPoolExecutor(max_workers=3) as pool:
            details_future = pool.submit(_fetch_details, place) if need_details else None
            wiki_future = pool.submit(_fetch_wiki, place) if need_wiki else None
            mbta_future = pool.submit(_fetch_nearest_t, place) if need_mbta else None
            details = details_future.result() if details_future else None
            wiki_info = wiki_future.result() if wiki_future else None
            nearest_t = mbta_future.result() if mbta_future else None
        wiki_failed = wiki_info is WIKI_FAILED
        _save_place(place, details, None if wiki_failed else wiki_info)
    timings['fetch'] = _lap(t)
    t = time.monotonic()

    card_status = 'cached'
    if card is None:
        card = _build_card(place, nearest_t, save=not wiki_failed)
        card_status = 'new' if card.pk else 'not saved'
        timings['bio'] = _lap(t)
    elif nearest_t is not None:
        card.nearest_t = nearest_t
        card.save(update_fields=['nearest_t'])

    logger.info('place card %d %r (details=%s, wiki=%s, mbta=%s, card=%s) timings_ms=%s',
                place.id, place.name, need_details, need_wiki, need_mbta, card_status, timings)
    return _response(place, card, permissions.saved_for_card(user, place))


# --- Place details --------------------------------------------------------

def _details_stale(place):
    if place.source != Place.SOURCE_GOOGLE:
        return False
    if place.details_fetched_at is None:
        return True
    return timezone.now() - place.details_fetched_at >= DETAILS_TTL


def _fetch_details(place):
    """Google details dict, or None if the call failed."""
    try:
        return google_places.place_details(place.external_id)
    except Exception as exc:
        logger.warning('place card %d: details unavailable (%s)', place.id, exc, exc_info=unexpected(exc))
        return None


# --- MBTA -----------------------------------------------------------------

def _fetch_nearest_t(place):
    """Nearest T stop dict, {} if there's none nearby, or None if the call failed."""
    try:
        return mbta.nearest_stop(place.lat, place.lng) or {}
    except Exception as exc:
        logger.warning('place card %d: mbta unavailable (%s)', place.id, exc, exc_info=unexpected(exc))
        return None


# --- Wikipedia ------------------------------------------------------------

def _fetch_wiki(place):
    """(wiki_title, wiki_summary) for the place, None if there's no article, or WIKI_FAILED.

    Google places from search usually have no wiki_title yet, so we look for a
    nearby article whose name matches (same rule the scan dedupe uses).
    """
    title = place.wiki_title
    try:
        if not title:
            title = _find_wiki_title(place)
        if not title:
            return None
        if is_subtopic(title, place.name):
            exact = _exact_article(place.name)
            if exact:
                return place.name, exact
        return title, wiki.summary(title)
    except Exception as exc:
        logger.warning('place card %d: wikipedia unavailable (%s)', place.id, exc, exc_info=unexpected(exc))
        return WIKI_FAILED


def _exact_article(name):
    """Summary of the article titled exactly `name`, or '' if there isn't one.

    Only used when the nearby article is a subtopic of the place (the Gardner
    Museum's own article isn't geotagged, but "Isabella Stewart Gardner Museum
    theft" is), so we know the place is notable enough to have one.
    """
    try:
        return wiki.summary(name)
    except ExternalAPIError:  # usually a 404: no such article
        return ''


def _find_wiki_title(place):
    """Nearby article whose name best matches the place (closest wins a tie), or None."""
    best, best_key = None, None
    for article in wiki.geosearch(place.lat, place.lng, radius=WIKI_LOOKUP_RADIUS_M):
        if not names_match(article['name'], place.name):
            continue
        key = (-name_similarity(article['name'], place.name),
               distance_m(place.lat, place.lng, article['lat'], article['lng']))
        if best_key is None or key < best_key:
            best, best_key = article['wiki_title'], key
    return best


def _save_place(place, details, wiki_info):
    fields = []
    if details is not None:
        for field in DETAIL_FIELDS:
            setattr(place, field, details[field])
        place.details_fetched_at = timezone.now()
        fields += [*DETAIL_FIELDS, 'details_fetched_at']
    if wiki_info is not None:
        place.wiki_title, place.wiki_summary = wiki_info
        fields += ['wiki_title', 'wiki_summary']
    if fields:
        place.save(update_fields=[*fields, 'updated_at'])


# --- Bio ------------------------------------------------------------------

def _build_card(place, nearest_t, save=True):
    """Write the bio and save a PlaceCard.

    Returns an unsaved card if the LLM fails, or if `save` is False (the facts
    were incomplete, so the bio shouldn't be kept forever).
    """
    try:
        bio = llm.write_bio(_facts(place))
    except Exception as exc:
        logger.warning('place card %d: bio unavailable, using fallback (%s)', place.id, exc, exc_info=unexpected(exc))
        return PlaceCard(place=place, bio=place.wiki_summary or '', nearest_t=nearest_t)
    if not save:
        return PlaceCard(place=place, bio=bio, nearest_t=nearest_t)

    try:
        card, _ = PlaceCard.objects.get_or_create(place=place, defaults={'bio': bio, 'nearest_t': nearest_t})
    except IntegrityError:
        # Two requests built the same card at once; keep the one that won.
        card = PlaceCard.objects.get(place=place)
    return card


def _facts(place):
    """Everything the LLM is allowed to use when writing the bio."""
    raw = place.raw_data or {}
    kind = raw.get('primaryType') or (place.types[0] if place.types else '')
    facts = {
        'name': place.name,
        'address': place.address,
        'kind': kind.replace('_', ' '),
        'categories': [t.replace('_', ' ') for t in place.types[:6]],
        'wikipedia_summary': place.wiki_summary,
        'rating': place.rating,
        'rating_count': place.rating_count,
        'price_range': google_places.price_range(place.price_level),
    }
    return {k: v for k, v in facts.items() if v not in (None, '', [])}


# --- Response -------------------------------------------------------------

def _response(place, card, saved=None):
    return {
        'id': place.id,
        'name': place.name,
        'bio': card.bio,
        'rating': place.rating,
        'rating_count': place.rating_count,
        'price_range': google_places.price_range(place.price_level),
        'hours': place.opening_hours or None,
        'nearest_t': card.nearest_t or None,  # {} means "no T stop nearby"
        'friends_interested': 0,      # step 19
        'saved': {'id': saved.id, 'visited': saved.visited, 'visited_at': saved.visited_at} if saved else None,
    }


def _lap(start):
    return round((time.monotonic() - start) * 1000)
