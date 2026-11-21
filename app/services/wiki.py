"""Wikipedia: geosearch for nearby articles and the REST summary for intro text.

No API key needed. Like google_places.py, these functions don't touch the
database and raise ExternalAPIError on failure.
"""

from urllib.parse import quote

from .http import request_json

API_URL = 'https://en.wikipedia.org/w/api.php'
SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/'

GEOSEARCH_RADIUS_M = 200


def geosearch(lat, lng, radius=GEOSEARCH_RADIUS_M, limit=20):
    """Wikipedia articles within `radius` meters of (lat, lng), closest first.

    Returns dicts of Place model fields. external_id is prefixed with "wiki:"
    so a Wikipedia pageid can never collide with a Google place_id.
    """
    params = {
        'action': 'query',
        'list': 'geosearch',
        'gscoord': f'{lat}|{lng}',
        'gsradius': radius,
        'gslimit': limit,
        'format': 'json',
    }
    data = request_json('GET', API_URL, label='wiki.geosearch', params=params)
    results = []
    for page in data.get('query', {}).get('geosearch', []):
        results.append({
            'external_id': f'wiki:{page["pageid"]}',
            'source': 'wiki',
            'name': page['title'],
            'address': '',
            'lat': page['lat'],
            'lng': page['lon'],
            'types': [],
            'raw_data': page,
            'wiki_title': page['title'],
        })
    return results


def summary(title):
    """Plain-text intro for an article title, or '' if the article has none.

    Follows redirects. Raises ExternalAPIError if the request fails
    (including a 404 for a missing article).
    """
    url = SUMMARY_URL + quote(title.replace(' ', '_'), safe='')
    data = request_json('GET', url, label='wiki.summary', params={'redirect': 'true'})
    if data.get('type') == 'disambiguation':
        return ''
    return data.get('extract', '')
