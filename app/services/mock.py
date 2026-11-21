"""Hardcoded Boston places for the Phase 1 mock endpoints.

These let the frontend build against the real response shapes before the
Google / Wikipedia / LLM services exist. Delete this module once steps 9-10
replace the remaining mock views.
"""

MOCK_PLACES = [
    {
        'id': 1,
        'name': 'Faneuil Hall',
        'address': '4 S Market St, Boston, MA 02109',
        'lat': 42.3600,
        'lng': -71.0568,
        'bio': (
            'Faneuil Hall has been a marketplace and meeting hall since 1742. '
            'Colonists gave speeches here protesting British taxes, which earned it '
            'the nickname "the Cradle of Liberty."'
        ),
        'rating': 4.5,
        'rating_count': 48210,
        'price_range': '$$',
        'hours': [
            'Monday: 10:00 AM - 9:00 PM',
            'Tuesday: 10:00 AM - 9:00 PM',
            'Wednesday: 10:00 AM - 9:00 PM',
            'Thursday: 10:00 AM - 9:00 PM',
            'Friday: 10:00 AM - 9:00 PM',
            'Saturday: 10:00 AM - 9:00 PM',
            'Sunday: 11:00 AM - 7:00 PM',
        ],
        'nearest_t': {'stop': 'Haymarket', 'lines': ['Orange', 'Green'], 'walk_min': 4},
    },
    {
        'id': 2,
        'name': 'Old State House',
        'address': '206 Washington St, Boston, MA 02109',
        'lat': 42.3587,
        'lng': -71.0575,
        'bio': (
            'Built in 1713, the Old State House is one of the oldest public buildings '
            'in the United States. The Declaration of Independence was read to '
            'Bostonians from its balcony in 1776.'
        ),
        'rating': 4.6,
        'rating_count': 6120,
        'price_range': None,
        'hours': [
            'Monday: 10:00 AM - 5:00 PM',
            'Tuesday: 10:00 AM - 5:00 PM',
            'Wednesday: 10:00 AM - 5:00 PM',
            'Thursday: 10:00 AM - 5:00 PM',
            'Friday: 10:00 AM - 5:00 PM',
            'Saturday: 10:00 AM - 5:00 PM',
            'Sunday: 10:00 AM - 5:00 PM',
        ],
        'nearest_t': {'stop': 'State', 'lines': ['Orange', 'Blue'], 'walk_min': 1},
    },
    {
        'id': 3,
        'name': 'Boston Public Library',
        'address': '700 Boylston St, Boston, MA 02116',
        'lat': 42.3493,
        'lng': -71.0782,
        'bio': (
            'Founded in 1848, the Boston Public Library was the first large free '
            'municipal library in the United States. Its McKim Building in Copley '
            'Square is known for its reading room and courtyard.'
        ),
        'rating': 4.8,
        'rating_count': 9870,
        'price_range': None,
        'hours': [
            'Monday: 9:00 AM - 8:00 PM',
            'Tuesday: 9:00 AM - 8:00 PM',
            'Wednesday: 9:00 AM - 8:00 PM',
            'Thursday: 9:00 AM - 8:00 PM',
            'Friday: 9:00 AM - 5:00 PM',
            'Saturday: 9:00 AM - 5:00 PM',
            'Sunday: Closed',
        ],
        'nearest_t': {'stop': 'Copley', 'lines': ['Green'], 'walk_min': 2},
    },
    {
        'id': 4,
        'name': 'Union Oyster House',
        'address': '41 Union St, Boston, MA 02108',
        'lat': 42.3613,
        'lng': -71.0569,
        'bio': (
            'Union Oyster House has served food since 1826, making it one of the '
            'oldest restaurants in the country. Its raw bar is the original from '
            'when it opened.'
        ),
        'rating': 4.3,
        'rating_count': 15300,
        'price_range': '$$$',
        'hours': [
            'Monday: 11:00 AM - 9:30 PM',
            'Tuesday: 11:00 AM - 9:30 PM',
            'Wednesday: 11:00 AM - 9:30 PM',
            'Thursday: 11:00 AM - 9:30 PM',
            'Friday: 11:00 AM - 10:00 PM',
            'Saturday: 11:00 AM - 10:00 PM',
            'Sunday: 11:00 AM - 9:30 PM',
        ],
        'nearest_t': {'stop': 'Haymarket', 'lines': ['Orange', 'Green'], 'walk_min': 2},
    },
    {
        'id': 5,
        'name': 'Boston Common',
        'address': '139 Tremont St, Boston, MA 02111',
        'lat': 42.3551,
        'lng': -71.0657,
        'bio': (
            'Boston Common, established in 1634, is the oldest public park in the '
            'United States. It is the starting point of the Freedom Trail.'
        ),
        'rating': None,
        'rating_count': None,
        'price_range': None,
        'hours': None,
        'nearest_t': {'stop': 'Park Street', 'lines': ['Red', 'Green'], 'walk_min': 1},
    },
]

_BY_ID = {p['id']: p for p in MOCK_PLACES}


def search(query):
    """Case-insensitive substring match on name."""
    q = ' '.join(query.lower().split())
    return {
        'results': [
            {
                'id': p['id'],
                'name': p['name'],
                'address': p['address'],
                'lat': p['lat'],
                'lng': p['lng'],
            }
            for p in MOCK_PLACES
            if q in p['name'].lower()
        ]
    }


def place_card(place_id):
    """Return the card for a mock place, or None if the id is unknown."""
    p = _BY_ID.get(place_id)
    if p is None:
        return None
    return {
        'id': p['id'],
        'name': p['name'],
        'bio': p['bio'],
        'rating': p['rating'],
        'rating_count': p['rating_count'],
        'price_range': p['price_range'],
        'hours': p['hours'],
        'nearest_t': p['nearest_t'],
        'friends_interested': 0,
        'saved': None,
    }
