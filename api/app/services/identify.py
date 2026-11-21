"""The scan flow behind POST /api/identify/.

candidates (cached) -> heading filter -> vision match (never cached) -> status.

Never raises for upstream failures:
- no candidates at all       -> not_found
- vision match fails         -> ambiguous, with the closest candidates
"""

import logging
import time

from .. import geo
from . import candidates as candidate_service
from . import llm
from .http import unexpected

logger = logging.getLogger(__name__)

MATCHED_MIN = 0.7
AMBIGUOUS_MIN = 0.4
TOP_N = 3

COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']


def identify(image_file, lat, lng, heading=None):
    timings = {}
    t = time.monotonic()

    def lap(step):
        nonlocal t
        now = time.monotonic()
        timings[step] = round((now - t) * 1000)
        t = now

    nearby = candidate_service.get_candidates(lat, lng)
    lap('candidates')
    shortlist = geo.filter_by_heading(nearby, lat, lng, heading)
    lap('heading_filter')

    if not shortlist:
        result = _response('not_found', None, [], 0.0)
        _log(lat, lng, heading, 0, result, timings)
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
        _log(lat, lng, heading, len(shortlist), result, timings)
        return result

    ranked = [shortlist[i] for i in match['ranked']]
    confidence = match['confidence']
    if ranked and confidence >= MATCHED_MIN:
        result = _response('matched', ranked[0], ranked, confidence)
    elif ranked and confidence >= AMBIGUOUS_MIN:
        result = _response('ambiguous', ranked[0], _pad(ranked, shortlist), confidence)
    else:
        # Still offer the closest places so the user can pick one by hand.
        result = _response('not_found', None, shortlist[:TOP_N], confidence)
    _log(lat, lng, heading, len(shortlist), result, timings)
    return result


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


def _log(lat, lng, heading, n_shortlist, result, timings):
    place = result['place']['name'] if result['place'] else None
    logger.info('identify %.5f,%.5f heading=%s shortlist=%d -> %s %r (%.2f) timings_ms=%s',
                lat, lng, heading, n_shortlist, result['status'], place, result['confidence'], timings)
