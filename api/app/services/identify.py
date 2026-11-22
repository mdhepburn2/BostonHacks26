"""The scan flow behind POST /api/identify/.

candidates (cached) -> heading filter -> vision match (never cached) -> status.

If the vision match isn't confident but Gemini read a name on a sign, we look
that name up with a Google text search around the user. The candidate list is
capped at 20 Google results, so in a dense block the place in the photo can be
missing from it; the sign lookup catches those.

Never raises for upstream failures:
- no candidates at all       -> not_found
- vision match fails         -> ambiguous, with the closest candidates
- sign lookup fails          -> whatever the vision match alone gave
"""

import logging
import time

from .. import geo
from . import candidates as candidate_service
from . import google_places, llm
from .http import unexpected

logger = logging.getLogger(__name__)

MATCHED_MIN = 0.7
AMBIGUOUS_MIN = 0.4
TOP_N = 3

# Sign lookup: a text search result counts only if its name matches the sign and
# it's this close to the user (GPS error plus the width of a street or two).
SIGN_MAX_DISTANCE_M = 150
SIGN_SEARCH_BIAS_RADIUS_M = 300
SIGN_SEARCH_RESULTS = 5
# A readable name on the sign plus a nearby place with that name is strong evidence.
SIGN_MATCH_CONFIDENCE = 0.8

COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']


def identify(image_file, lat, lng, heading=None, accuracy=None):
    timings = {}
    t = time.monotonic()

    def lap(step):
        nonlocal t
        now = time.monotonic()
        timings[step] = round((now - t) * 1000)
        t = now

    nearby = candidate_service.get_candidates(lat, lng)
    lap('candidates')
    shortlist = geo.filter_by_heading(nearby, lat, lng, heading, accuracy=accuracy)
    lap('heading_filter')

    if not shortlist:
        result = _response('not_found', None, [], 0.0)
        _log(lat, lng, heading, accuracy, 0, result, timings)
        return result

    try:
        image_bytes = llm.prepare_image(image_file)
        lap('resize')
        match = llm.match_photo(image_bytes, [_describe(p, lat, lng) for p in shortlist], lat, lng, heading)
        lap('vision')
    except Exception as exc:  # Gemini failed, or Pillow couldn't read the image
        lap('vision')
        logger.warning('identify: vision match unavailable, returning closest candidates (%s)', exc,
                       exc_info=unexpected(exc))
        result = _response('ambiguous', None, shortlist[:TOP_N], 0.0)
        _log(lat, lng, heading, accuracy, len(shortlist), result, timings)
        return result

    ranked = [shortlist[i] for i in match['ranked']]
    confidence = match['confidence']
    sign_text = match.get('sign_text', '')
    if sign_text and not (ranked and confidence >= MATCHED_MIN):
        signed = _find_by_sign(sign_text, lat, lng)
        lap('sign_search')
        if signed:
            ranked = [signed] + [p for p in ranked if p != signed]
            confidence = SIGN_MATCH_CONFIDENCE

    if ranked and confidence >= MATCHED_MIN:
        result = _response('matched', ranked[0], ranked, confidence)
    elif ranked and confidence >= AMBIGUOUS_MIN:
        result = _response('ambiguous', ranked[0], _pad(ranked, shortlist), confidence)
    else:
        # Still offer the closest places so the user can pick one by hand.
        result = _response('not_found', None, shortlist[:TOP_N], confidence)
    _log(lat, lng, heading, accuracy, len(shortlist), result, timings)
    return result


def _find_by_sign(sign_text, lat, lng):
    """The nearby Place whose name matches what's written on the sign, or None.

    Not cached: it only runs when the vision match missed, and the answer
    depends on where the user is standing (chains have many branches).
    """
    try:
        results = google_places.text_search(sign_text, lat, lng, max_results=SIGN_SEARCH_RESULTS,
                                            bias_radius=SIGN_SEARCH_BIAS_RADIUS_M)
    except Exception as exc:
        logger.warning('identify: sign lookup for %r failed (%s)', sign_text, exc, exc_info=unexpected(exc))
        return None

    matches = []
    for item in results:
        dist = geo.distance_m(lat, lng, item['lat'], item['lng'])
        if dist <= SIGN_MAX_DISTANCE_M and sign_matches(sign_text, item['name']):
            matches.append((-candidate_service.name_similarity(sign_text, item['name']), dist, item))
    if not matches:
        logger.info('identify: sign %r matched nothing within %dm (%d results)',
                    sign_text, SIGN_MAX_DISTANCE_M, len(results))
        return None

    _, dist, best = min(matches, key=lambda m: (m[0], m[1]))
    place = candidate_service.upsert_places([best])[0]
    logger.info('identify: sign %r -> %r %.0fm away', sign_text, place.name, dist)
    return place


def sign_matches(sign_text, name):
    """True if a place called `name` could be the one whose sign reads `sign_text`.

    Same rules as the Wikipedia/Google dedupe, plus a sign that's the start of
    the name ("CVS" for "CVS Pharmacy"), since short names fail the fuzzy match.
    """
    if candidate_service.names_match(sign_text, name):
        return True
    sign = candidate_service.normalize_name(sign_text)
    full = candidate_service.normalize_name(name)
    return bool(sign) and f'{full} '.startswith(f'{sign} ')


def _describe(place, lat, lng):
    """What the LLM gets to know about each candidate."""
    if place.source == 'wiki':
        kind = 'landmark or historic site (from Wikipedia)'
    else:
        kind = (place.raw_data or {}).get('primaryType') or (place.types[0] if place.types else 'place')
        kind = kind.replace('_', ' ')
    bearing = geo.bearing_deg(lat, lng, place.lat, place.lng)
    return {
        'name': place.name,
        'kind': kind,
        'distance_m': geo.distance_m(lat, lng, place.lat, place.lng),
        'direction': COMPASS[round(bearing / 45) % 8],
    }


def _pad(ranked, shortlist):
    """Top TOP_N places: the LLM's ranking first, then the closest others."""
    out = list(ranked[:TOP_N])
    for p in shortlist:
        if len(out) >= TOP_N:
            break
        if p not in out:
            out.append(p)
    return out


def _short(place):
    return {'id': place.id, 'name': place.name, 'lat': place.lat, 'lng': place.lng}


def _response(status, place, candidates, confidence):
    return {
        'status': status,
        'place': _short(place) if place else None,
        'candidates': [_short(p) for p in candidates[:TOP_N]],
        'confidence': round(confidence, 2),
    }


def _log(lat, lng, heading, accuracy, n_shortlist, result, timings):
    place = result['place']['name'] if result['place'] else None
    logger.info('identify %.5f,%.5f heading=%s accuracy=%s shortlist=%d -> %s %r (%.2f) timings_ms=%s',
                lat, lng, heading, accuracy, n_shortlist, result['status'], place, result['confidence'],
                timings)
