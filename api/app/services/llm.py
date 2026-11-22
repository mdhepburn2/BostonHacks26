"""Gemini calls: the scan flow's vision match and the place card bio.

Every call asks for structured JSON output and the response is validated
before anyone uses it. Anything wrong (missing key, network error, bad JSON,
an index outside the candidate list) raises ExternalAPIError so the caller
can apply its fallback.
"""

import base64
import io
import json
import logging
import time

from django.conf import settings
from PIL import Image, ImageOps

from .http import ExternalAPIError, request_json

logger = logging.getLogger(__name__)

BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
MAX_IMAGE_SIDE = 1024
JPEG_QUALITY = 85

VISION_PROMPT = """You are helping someone walking around Boston identify the place in their photo.

They are standing at latitude {lat:.5f}, longitude {lng:.5f}{heading_text}.
These are the places near them. Each line is: number. name (type, distance and direction from the user).

{candidate_lines}

The image may not show any of these places, or may not be a photo of a place at all
(people take photos by accident, or of their screen). Saying "none of them" is a normal,
correct answer. Work through these fields in order:

1. "photo_shows": one short sentence describing only what is literally visible.
2. "is_place_photo": true only if this is a camera photo of a real-world scene: a building,
   storefront, street, landmark, statue, park or a room inside a venue. false for logos,
   icons, app or splash screens, screenshots, drawings, graphics, documents, close-ups of a
   single object, and blank, dark or unreadably blurry images.
3. "evidence": the specific thing in the photo that ties it to your first pick, such as the
   place's name on a sign, or a building or statue that clearly fits its type. Leave it
   empty if there is nothing like that.
4. "ranked": up to 3 numbers from the list above, best match first. Leave it empty if
   "is_place_photo" is false or nothing in the photo points to any of them. Never pick a
   place just because it is the closest, or because a shape or colour vaguely resembles it.
5. "confidence": how sure you are (0 to 1) that the FIRST number in "ranked" is what the
   photo shows. Use 0 if "ranked" is empty. Only go above 0.7 when the evidence is specific
   (a readable name, or a distinctive landmark). If you are guessing, stay below 0.4.

Rules:
- You may ONLY answer with numbers from the list above. Never invent a place.
- Use only the photo and the information above.
"""

VISION_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'photo_shows': {'type': 'STRING'},
        'is_place_photo': {'type': 'BOOLEAN'},
        'evidence': {'type': 'STRING'},
        'ranked': {'type': 'ARRAY', 'items': {'type': 'INTEGER'}},
        'confidence': {'type': 'NUMBER'},
    },
    'required': ['photo_shows', 'is_place_photo', 'evidence', 'ranked', 'confidence'],
    # Gemini fills fields in this order, so it describes the image before it picks.
    'propertyOrdering': ['photo_shows', 'is_place_photo', 'evidence', 'ranked', 'confidence'],
}
# Without any stated evidence the pick is a guess, so it can be "ambiguous" at most.
NO_EVIDENCE_MAX_CONFIDENCE = 0.5


BIO_PROMPT = """Write a short bio for a place card in an app for people exploring Boston on foot.

Here are the ONLY facts you may use, as JSON:
{facts}

Rules:
- Use only the facts above. Do not add dates, history, names, awards or details that aren't in them, even if you think you know them.
- 2 to 4 sentences, under 80 words. Friendly and plain, no marketing language, no emojis.
- Don't repeat the rating, rating count or price range as numbers; the card already shows them.
- If the facts are thin, write one or two sentences saying what kind of place it is and where it is. That's fine.
"""

BIO_SCHEMA = {
    'type': 'OBJECT',
    'properties': {'bio': {'type': 'STRING'}},
    'required': ['bio'],
}
BIO_MAX_CHARS = 800


def prepare_image(file):
    """Shrink an uploaded image so its longest side is at most MAX_IMAGE_SIDE; return JPEG bytes."""
    file.seek(0)
    img = Image.open(file)
    img = ImageOps.exif_transpose(img)  # phone photos store rotation in EXIF
    img = img.convert('RGB')
    img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=JPEG_QUALITY)
    return buf.getvalue()


def match_photo(image_bytes, candidates, lat, lng, heading=None):
    """Ask Gemini which candidate the photo shows.

    `candidates` is a list of dicts with `name`, `kind`, `distance_m` and
    `direction` (built by the caller). Returns {"ranked": [0-based indices],
    "confidence": float}.
    """
    if not candidates:
        raise ExternalAPIError('no candidates to match against')

    lines = '\n'.join(
        f'{i}. {c["name"]} ({c["kind"]}, {c["distance_m"]:.0f}m {c["direction"]})'
        for i, c in enumerate(candidates, start=1)
    )
    heading_text = f', facing {heading:.0f} degrees (0 = north, 90 = east)' if heading is not None else ''
    prompt = VISION_PROMPT.format(lat=lat, lng=lng, heading_text=heading_text, candidate_lines=lines)

    data = _generate(
        parts=[
            {'text': prompt},
            {'inline_data': {'mime_type': 'image/jpeg', 'data': base64.b64encode(image_bytes).decode()}},
        ],
        schema=VISION_SCHEMA,
        label='gemini.vision',
    )
    return _validate_vision(data, len(candidates))


def _validate_vision(data, n_candidates):
    ranked = data.get('ranked')
    confidence = data.get('confidence')
    is_place_photo = data.get('is_place_photo')
    evidence = data.get('evidence')
    if (not isinstance(ranked, list) or isinstance(confidence, bool)
            or not isinstance(confidence, (int, float)) or not isinstance(is_place_photo, bool)
            or not isinstance(evidence, str)):
        raise ExternalAPIError(f'gemini.vision returned an unexpected shape: {data!r}')

    indices = []
    for n in ranked:
        if isinstance(n, bool) or not isinstance(n, int) or not 1 <= n <= n_candidates:
            raise ExternalAPIError(f'gemini.vision picked {n!r}, not one of 1..{n_candidates}')
        if n - 1 not in indices:
            indices.append(n - 1)

    logger.info('gemini.vision: shows=%r place_photo=%s evidence=%r ranked=%s confidence=%s',
                data.get('photo_shows'), is_place_photo, evidence, ranked, confidence)

    confidence = min(max(float(confidence), 0.0), 1.0)
    if not is_place_photo:
        # A logo, screenshot or blank frame: whatever it ranked is a guess.
        indices = []
    if not evidence.strip():
        confidence = min(confidence, NO_EVIDENCE_MAX_CONFIDENCE)
    if not indices:
        confidence = 0.0
    return {'ranked': indices[:3], 'confidence': confidence}


def write_bio(facts):
    """Ask Gemini for a short bio built only from `facts` (a dict). Returns the bio string."""
    prompt = BIO_PROMPT.format(facts=json.dumps(facts, ensure_ascii=False, indent=2))
    data = _generate(parts=[{'text': prompt}], schema=BIO_SCHEMA, label='gemini.bio')
    return _validate_bio(data)


def _validate_bio(data):
    bio = data.get('bio')
    if not isinstance(bio, str) or not bio.strip():
        raise ExternalAPIError(f'gemini.bio returned an unexpected shape: {data!r}')
    bio = ' '.join(bio.split())
    if len(bio) > BIO_MAX_CHARS:
        raise ExternalAPIError(f'gemini.bio returned {len(bio)} chars, max {BIO_MAX_CHARS}')
    return bio


def _generate(parts, schema, label):
    """Call generateContent with a JSON response schema and return the parsed JSON."""
    key = settings.LLM_API_KEY
    if not key:
        raise ExternalAPIError('LLM_API_KEY is not set')

    body = {
        'contents': [{'role': 'user', 'parts': parts}],
        'generationConfig': {
            'responseMimeType': 'application/json',
            'responseSchema': schema,
            'temperature': 0,
        },
    }
    if settings.LLM_THINKING_LEVEL:
        body['generationConfig']['thinkingConfig'] = {'thinkingLevel': settings.LLM_THINKING_LEVEL}
    start = time.monotonic()
    data = request_json(
        'POST', f'{BASE_URL}/{settings.LLM_MODEL}:generateContent',
        label=label, headers={'x-goog-api-key': key, 'Content-Type': 'application/json'}, json=body,
    )
    try:
        text = data['candidates'][0]['content']['parts'][0]['text']
        result = json.loads(text)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        logger.warning('%s returned no usable JSON: %s', label, str(data)[:300])
        raise ExternalAPIError(f'{label} returned no usable JSON') from exc
    if not isinstance(result, dict):
        raise ExternalAPIError(f'{label} returned {type(result).__name__}, expected an object')
    logger.info('%s parsed in %.0fms total', label, (time.monotonic() - start) * 1000)
    return result
