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
These are the only places it can be. Each line is: number. name (type, distance and direction from the user).

{candidate_lines}

Look at the photo and decide which numbered place it shows. Rules:
- You may ONLY answer with numbers from the list above. Never invent a place.
- Use only the photo and the information above. Don't rely on outside guesses about what is nearby.
- "ranked" holds up to 3 numbers, best match first. Leave it empty if the photo shows none of them.
- "confidence" is how sure you are (0 to 1) that the FIRST number in "ranked" is what the photo shows. Use 0 if "ranked" is empty.
"""

VISION_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'ranked': {'type': 'ARRAY', 'items': {'type': 'INTEGER'}},
        'confidence': {'type': 'NUMBER'},
    },
    'required': ['ranked', 'confidence'],
}


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
    if not isinstance(ranked, list) or isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        raise ExternalAPIError(f'gemini.vision returned an unexpected shape: {data!r}')

    indices = []
    for n in ranked:
        if isinstance(n, bool) or not isinstance(n, int) or not 1 <= n <= n_candidates:
            raise ExternalAPIError(f'gemini.vision picked {n!r}, not one of 1..{n_candidates}')
        if n - 1 not in indices:
            indices.append(n - 1)

    confidence = min(max(float(confidence), 0.0), 1.0)
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
