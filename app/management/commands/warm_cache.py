"""Pre-cache the demo so nothing on stage waits on Google, Wikipedia, MBTA or Gemini.

    pipenv run python manage.py warm_cache
    pipenv run python manage.py warm_cache --no-cards     # skip the Gemini bios
    pipenv run python manage.py warm_cache --only-search  # just the search terms

What gets warmed:
1. Scan spots: the nearby-candidates cache for each spot, plus the 8 grid cells
   around it (cells are only ~110m x 80m, and GPS drifts).
2. Searches: the text search cache for each term.
3. Place cards: details, Wikipedia summary, bio and nearest T stop for the
   closest few places at each spot and the top result of each search.

The vision match on the photo can't be warmed; it runs on every scan by design.

Safe to run as often as you like: anything already cached is skipped by the
services themselves, so a second run is fast and only retries what failed.
Edit SPOTS and SEARCHES below to match the demo.
"""

import time

from django.core.management.base import BaseCommand

from app.models import NearbySearchCache, PlaceCard
from app.services.candidates import get_candidates, grid_key
from app.services.http import ExternalAPIError
from app.services.place_card import get_card
from app.services.search import search_places

# (label, lat, lng): where you'll stand and take a photo. Freedom Trail by default.
SPOTS = [
    ('Boston Common (Park St)', 42.3554, -71.0640),
    ('Massachusetts State House', 42.3587, -71.0638),
    ('Park Street Church', 42.3565, -71.0620),
    ('Granary Burying Ground', 42.3573, -71.0615),
    ("King's Chapel", 42.3581, -71.0603),
    ('Old South Meeting House', 42.3570, -71.0586),
    ('Old State House', 42.3588, -71.0574),
    ('Faneuil Hall', 42.3600, -71.0568),
    ('Paul Revere House', 42.3637, -71.0537),
    ('Old North Church', 42.3663, -71.0544),
    ('Boston Public Library (Copley)', 42.3493, -71.0782),
]

# Names you'll type into search.
SEARCHES = [
    'faneuil hall',
    'boston public library',
    'old north church',
    'paul revere house',
    'union oyster house',
    "mike's pastry",
    'isabella stewart gardner museum',
    'fenway park',
]

# Cards to build for each spot: its closest places, since that's what a scan will match.
CARDS_PER_SPOT = 3

# One grid cell is 0.001 degrees; see candidates.grid_key.
CELL = 0.001


class Command(BaseCommand):
    help = 'Pre-cache scan candidates, searches and place cards for the demo locations.'

    def add_arguments(self, parser):
        parser.add_argument('--no-cards', action='store_true',
                            help="Skip place cards (they use Gemini and Google's pricier details tier).")
        parser.add_argument('--no-neighbors', action='store_true',
                            help='Only warm the exact grid cell of each spot, not the 8 around it.')
        parser.add_argument('--only-spots', action='store_true', help='Skip the search terms.')
        parser.add_argument('--only-search', action='store_true', help='Skip the scan spots.')
        parser.add_argument('--cards-per-spot', type=int, default=CARDS_PER_SPOT,
                            help=f'Closest places per spot to build cards for (default {CARDS_PER_SPOT}).')
        parser.add_argument('--delay', type=float, default=0,
                            help='Seconds to wait between new cards, if an API rate-limits you.')

    def handle(self, *args, **opts):
        start = time.monotonic()
        self.incomplete = []  # spots and cards worth a rerun
        to_card = {}  # place id -> Place, in the order we found them

        if not opts['only_search']:
            self._heading('Scan spots')
            for label, lat, lng in SPOTS:
                places = self._warm_spot(label, lat, lng, neighbors=not opts['no_neighbors'])
                for place in places[:opts['cards_per_spot']]:
                    to_card.setdefault(place.id, place)

        if not opts['only_spots']:
            self._heading('Searches')
            for term in SEARCHES:
                places = self._warm_search(term)
                if places:
                    to_card.setdefault(places[0].id, places[0])

        if not opts['no_cards']:
            self._heading(f'Place cards ({len(to_card)})')
            for place in to_card.values():
                was_cached = PlaceCard.objects.filter(place=place).exists()
                if not self._warm_card(place):
                    self.incomplete.append(place.name)
                if opts['delay'] and not was_cached:
                    time.sleep(opts['delay'])

        self._heading('Done')
        self.stdout.write(f'Took {time.monotonic() - start:.1f}s.')
        if self.incomplete:
            self.stdout.write(self.style.WARNING(
                f'{len(self.incomplete)} incomplete: {", ".join(self.incomplete)}. '
                'Run the command again to retry them (add --delay 2 if an API is rate-limiting).'))
        else:
            self.stdout.write(self.style.SUCCESS('Everything is cached.'))

    # --- Steps --------------------------------------------------------------

    def _warm_spot(self, label, lat, lng, neighbors):
        """Warm the spot's grid cell (and its neighbors). Returns the spot's places, closest first."""
        t = time.monotonic()
        points = [(lat, lng)]
        if neighbors:
            points += [(lat + dlat, lng + dlng)
                       for dlat in (-CELL, 0, CELL) for dlng in (-CELL, 0, CELL) if dlat or dlng]
        places = get_candidates(lat, lng)
        for p_lat, p_lng in points[1:]:
            get_candidates(p_lat, p_lng)

        # candidates.py skips saving a cell if Google or Wikipedia failed, so check.
        keys = {grid_key(p_lat, p_lng) for p_lat, p_lng in points}
        missing = len(keys) - NearbySearchCache.objects.filter(grid_key__in=keys).count()
        closest = ', '.join(p.name for p in places[:3]) or 'nothing found'
        line = (f'  {label} [{grid_key(lat, lng)}]: {len(places)} places, '
                f'{len(keys)} cells in {self._ms(t)}  ->  {closest}')
        if missing:
            self.stdout.write(self.style.WARNING(f'{line}  ({missing} cells not cached)'))
            self.incomplete.append(label)
        else:
            self.stdout.write(line)
        return places

    def _warm_search(self, term):
        t = time.monotonic()
        try:
            places = search_places(term)
        except ExternalAPIError as exc:
            self.stdout.write(self.style.ERROR(f'  "{term}": failed ({exc})'))
            return []
        top = places[0].name if places else 'no results'
        self.stdout.write(f'  "{term}": {len(places)} results in {self._ms(t)}  ->  {top}')
        return places

    def _warm_card(self, place):
        """Build the card. Returns False if part of it couldn't be cached (worth a rerun)."""
        t = time.monotonic()
        card = get_card(place)
        saved = PlaceCard.objects.filter(place=place).first()
        problems = []
        if saved is None:
            problems.append('bio not cached')
        elif saved.nearest_t is None:
            problems.append('no T stop yet')
        t_stop = (card['nearest_t'] or {}).get('stop', '-')
        line = f'  {place.name}: rating {card["rating"]}, T {t_stop}, in {self._ms(t)}'
        if problems:
            self.stdout.write(self.style.WARNING(f'{line}  ({", ".join(problems)})'))
        else:
            self.stdout.write(line)
        return not problems

    # --- Output -------------------------------------------------------------

    def _heading(self, text):
        self.stdout.write(self.style.MIGRATE_HEADING(f'\n{text}'))

    @staticmethod
    def _ms(start):
        return f'{(time.monotonic() - start) * 1000:.0f}ms'
