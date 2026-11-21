import io

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APITestCase
from unittest import mock as umock

from .models import Place


def make_image():
    buf = io.BytesIO()
    Image.new('RGB', (10, 10), 'red').save(buf, format='JPEG')
    return SimpleUploadedFile('photo.jpg', buf.getvalue(), content_type='image/jpeg')


SHORT_PLACE_KEYS = {'id', 'name', 'lat', 'lng'}


class HealthTests(APITestCase):
    def test_health_returns_ok(self):
        response = self.client.get('/api/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_health_sends_cors_header(self):
        response = self.client.get('/api/health/', HTTP_ORIGIN='http://localhost:8081')
        self.assertEqual(response['Access-Control-Allow-Origin'], '*')


class IdentifyTests(APITestCase):
    """Request validation and response shape. External calls are mocked; flow logic is in IdentifyFlowTests."""

    url = '/api/identify/'

    def setUp(self):
        self.place = Place.objects.create(external_id='g1', source='google', name='Faneuil Hall',
                                          lat=42.3600, lng=-71.0568)
        patches = [
            umock.patch('app.services.identify.candidate_service.get_candidates', return_value=[self.place]),
            umock.patch('app.services.identify.llm.match_photo', return_value={'ranked': [0], 'confidence': 0.9}),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def test_returns_contract_shape(self):
        response = self.client.post(
            self.url,
            {'image': make_image(), 'lat': 42.3601, 'lng': -71.0567, 'heading': 90},
            format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(set(body), {'status', 'place', 'candidates', 'confidence'})
        self.assertEqual(body['status'], 'matched')
        self.assertEqual(set(body['place']), SHORT_PLACE_KEYS)
        for c in body['candidates']:
            self.assertEqual(set(c), SHORT_PLACE_KEYS)

    def test_heading_is_optional(self):
        response = self.client.post(
            self.url, {'image': make_image(), 'lat': 42.36, 'lng': -71.05}, format='multipart'
        )
        self.assertEqual(response.status_code, 200)

    def test_missing_image_is_400(self):
        response = self.client.post(self.url, {'lat': 42.36, 'lng': -71.05}, format='multipart')
        self.assertEqual(response.status_code, 400)

    def test_non_image_file_is_400(self):
        bad = SimpleUploadedFile('notes.txt', b'hello', content_type='text/plain')
        response = self.client.post(
            self.url, {'image': bad, 'lat': 42.36, 'lng': -71.05}, format='multipart'
        )
        self.assertEqual(response.status_code, 400)

    def test_out_of_range_lat_is_400(self):
        response = self.client.post(
            self.url, {'image': make_image(), 'lat': 200, 'lng': -71.05}, format='multipart'
        )
        self.assertEqual(response.status_code, 400)


class SearchTests(APITestCase):
    url = '/api/places/search/'

    def test_missing_query_is_400(self):
        self.assertEqual(self.client.get(self.url).status_code, 400)

    def test_lat_without_lng_is_400(self):
        self.assertEqual(self.client.get(self.url, {'q': 'library', 'lat': 42.36}).status_code, 400)


# --- Candidate generation (step 6) ----------------------------------------

from datetime import timedelta
from unittest import mock as umock

from django.test import TestCase
from django.utils import timezone

from .models import NearbySearchCache, Place
from .services import candidates
from .services.http import ExternalAPIError


def g(pid, name, lat, lng):
    return {
        'external_id': pid, 'source': 'google', 'name': name, 'address': f'{name} St',
        'lat': lat, 'lng': lng, 'types': ['tourist_attraction'], 'raw_data': {'id': pid},
    }


def w(pageid, title, lat, lng):
    return {
        'external_id': f'wiki:{pageid}', 'source': 'wiki', 'name': title, 'address': '',
        'lat': lat, 'lng': lng, 'types': [], 'raw_data': {'pageid': pageid}, 'wiki_title': title,
    }


GOOGLE_RESULTS = [
    g('g_faneuil', 'Faneuil Hall Marketplace', 42.3600, -71.0568),
    g('g_oyster', 'Union Oyster House', 42.3613, -71.0569),
]
WIKI_RESULTS = [
    w(1, 'Faneuil Hall', 42.3601, -71.0567),
    w(2, 'Old State House (Boston)', 42.3587, -71.0575),
]


@umock.patch.object(candidates.wiki, 'geosearch')
@umock.patch.object(candidates.google_places, 'nearby_search')
class CandidateTests(TestCase):
    lat, lng = 42.3601, -71.0567

    def test_grid_key_rounds_to_three_decimals(self, *_):
        self.assertEqual(candidates.grid_key(42.35849, -71.05705), '42.358,-71.057')
        self.assertEqual(candidates.grid_key(-0.0001, 0.0001), '0.000,0.000')

    def test_miss_fetches_dedupes_upserts_and_caches(self, nearby, geo):
        nearby.return_value = GOOGLE_RESULTS
        geo.return_value = WIKI_RESULTS

        places = candidates.get_candidates(self.lat, self.lng)

        # Searched around the grid cell's center, not the exact point
        nearby.assert_called_once_with(42.36, -71.057)
        geo.assert_called_once_with(42.36, -71.057)
        # Faneuil Hall article merged into the Google place; Old State House kept
        self.assertEqual(Place.objects.count(), 3)
        faneuil = Place.objects.get(external_id='g_faneuil')
        self.assertEqual(faneuil.wiki_title, 'Faneuil Hall')
        self.assertFalse(Place.objects.filter(external_id='wiki:1').exists())
        self.assertTrue(Place.objects.filter(external_id='wiki:2').exists())
        # Sorted by distance from the user
        self.assertEqual(places[0].external_id, 'g_faneuil')
        cache = NearbySearchCache.objects.get(grid_key='42.360,-71.057')
        self.assertEqual(cache.places.count(), 3)

    def test_hit_skips_external_calls(self, nearby, geo):
        nearby.return_value = GOOGLE_RESULTS
        geo.return_value = WIKI_RESULTS
        candidates.get_candidates(self.lat, self.lng)
        nearby.reset_mock()
        geo.reset_mock()

        places = candidates.get_candidates(self.lat + 0.0002, self.lng)  # same cell

        nearby.assert_not_called()
        geo.assert_not_called()
        self.assertEqual(len(places), 3)

    def test_expired_cache_refetches(self, nearby, geo):
        nearby.return_value = GOOGLE_RESULTS
        geo.return_value = []
        candidates.get_candidates(self.lat, self.lng)
        NearbySearchCache.objects.update(created_at=timezone.now() - timedelta(days=8))

        nearby.return_value = GOOGLE_RESULTS[:1]
        candidates.get_candidates(self.lat, self.lng)

        self.assertEqual(nearby.call_count, 2)
        cache = NearbySearchCache.objects.get()
        self.assertEqual(cache.places.count(), 1)
        self.assertGreater(cache.created_at, timezone.now() - timedelta(minutes=1))

    def test_upsert_keeps_details_and_never_duplicates(self, nearby, geo):
        Place.objects.create(
            external_id='g_oyster', source='google', name='Old name', lat=0, lng=0,
            rating=4.3, wiki_summary='kept',
        )
        nearby.return_value = GOOGLE_RESULTS
        geo.return_value = []

        candidates.get_candidates(self.lat, self.lng)

        self.assertEqual(Place.objects.filter(external_id='g_oyster').count(), 1)
        oyster = Place.objects.get(external_id='g_oyster')
        self.assertEqual(oyster.name, 'Union Oyster House')
        self.assertEqual(oyster.rating, 4.3)
        self.assertEqual(oyster.wiki_summary, 'kept')

    def test_google_failure_falls_back_to_wiki_and_skips_cache(self, nearby, geo):
        nearby.side_effect = ExternalAPIError('no key')
        geo.return_value = WIKI_RESULTS

        places = candidates.get_candidates(self.lat, self.lng)

        self.assertEqual({p.external_id for p in places}, {'wiki:1', 'wiki:2'})
        self.assertFalse(NearbySearchCache.objects.exists())

    def test_both_fail_returns_empty(self, nearby, geo):
        nearby.side_effect = ExternalAPIError('down')
        geo.side_effect = ExternalAPIError('down')
        self.assertEqual(candidates.get_candidates(self.lat, self.lng), [])
        self.assertFalse(NearbySearchCache.objects.exists())

    def test_dedupe_prefers_best_name_over_closest(self, nearby, geo):
        google = [g('g_isg', 'Isabella Stewart Gardner Museum', 42.3381, -71.0991)]
        wiki_ = [w(1, 'Isabella Stewart Gardner Museum theft', 42.3381, -71.0991),  # closer
                 w(2, 'Isabella Stewart Gardner Museum', 42.3384, -71.0991)]
        merged = {m['external_id']: m for m in candidates.dedupe(google, wiki_)}
        self.assertEqual(merged['g_isg']['wiki_title'], 'Isabella Stewart Gardner Museum')
        self.assertIn('wiki:1', merged)  # the theft article stays its own row
        self.assertNotIn('wiki:2', merged)

    def test_far_apart_same_name_is_not_merged(self, nearby, geo):
        nearby.return_value = [g('g_x', 'Faneuil Hall', 42.3600, -71.0568)]
        geo.return_value = [w(9, 'Faneuil Hall', 42.3650, -71.0568)]  # ~550m away
        self.assertEqual(len(candidates.get_candidates(self.lat, self.lng)), 2)


class NameMatchTests(TestCase):
    def test_matches(self):
        self.assertTrue(candidates.names_match('Faneuil Hall', 'Faneuil Hall Marketplace'))
        self.assertTrue(candidates.names_match('Old State House (Boston)', 'Old State House'))
        self.assertTrue(candidates.names_match('The Paul Revere House', 'Paul Revere House'))

    def test_non_matches(self):
        self.assertFalse(candidates.names_match('Park', 'Park Street Church'))
        self.assertFalse(candidates.names_match('Union Oyster House', 'Old State House'))


# --- Heading filter (step 7) ----------------------------------------------

from types import SimpleNamespace

from . import geo


def pt(name, lat, lng):
    return SimpleNamespace(name=name, lat=lat, lng=lng)


class BearingTests(TestCase):
    def test_cardinal_directions(self):
        lat, lng = 42.36, -71.06
        self.assertAlmostEqual(geo.bearing_deg(lat, lng, lat + 0.01, lng), 0, delta=0.5)
        self.assertAlmostEqual(geo.bearing_deg(lat, lng, lat, lng + 0.01), 90, delta=0.5)
        self.assertAlmostEqual(geo.bearing_deg(lat, lng, lat - 0.01, lng), 180, delta=0.5)
        self.assertAlmostEqual(geo.bearing_deg(lat, lng, lat, lng - 0.01), 270, delta=0.5)

    def test_angle_diff_wraps_around_north(self):
        self.assertEqual(geo.angle_diff_deg(350, 10), 20)
        self.assertEqual(geo.angle_diff_deg(10, 350), 20)
        self.assertEqual(geo.angle_diff_deg(0, 180), 180)


class HeadingFilterTests(TestCase):
    lat, lng = 42.3600, -71.0600
    # ~111m per 0.001 lat, ~82m per 0.001 lng in Boston
    north_near = pt('north_near', 42.3610, -71.0600)
    north_far = pt('north_far', 42.3620, -71.0600)
    north_east = pt('north_east', 42.3610, -71.0590)   # bearing ~37°
    east = pt('east', 42.3600, -71.0590)
    south = pt('south', 42.3590, -71.0600)
    west = pt('west', 42.3600, -71.0610)
    right_here = pt('right_here', 42.36005, -71.06005)  # ~7m, south-west

    def names(self, places):
        return [p.name for p in places]

    def all(self):
        return [self.south, self.north_far, self.east, self.north_near,
                self.west, self.north_east, self.right_here]

    def test_keeps_places_in_front_sorted_by_distance(self):
        result = geo.filter_by_heading(self.all(), self.lat, self.lng, heading=0)
        self.assertEqual(self.names(result), ['right_here', 'north_near', 'north_east', 'north_far'])

    def test_wraps_around_north(self):
        result = geo.filter_by_heading([self.north_near, self.east, self.west],
                                       self.lat, self.lng, heading=350)
        self.assertEqual(self.names(result), ['north_near'])

    def test_heading_outside_0_360_is_normalized(self):
        result = geo.filter_by_heading([self.north_near, self.east], self.lat, self.lng, heading=450)
        self.assertEqual(self.names(result), ['east'])

    def test_no_heading_returns_all_by_distance(self):
        result = geo.filter_by_heading(self.all(), self.lat, self.lng, heading=None)
        self.assertEqual(len(result), 7)
        self.assertEqual(result[0].name, 'right_here')

    def test_nothing_in_front_falls_back_to_all(self):
        places = [self.south, self.east]
        result = geo.filter_by_heading(places, self.lat, self.lng, heading=300)
        self.assertEqual(self.names(result), ['east', 'south'])

    def test_capped_at_max(self):
        places = [pt(f'p{i}', 42.3601 + i * 0.0001, -71.0600) for i in range(12)]
        result = geo.filter_by_heading(places, self.lat, self.lng, heading=0)
        self.assertEqual(len(result), geo.MAX_CANDIDATES)
        self.assertEqual(result[0].name, 'p0')

    def test_empty_input(self):
        self.assertEqual(geo.filter_by_heading([], self.lat, self.lng, heading=0), [])


# --- Vision match + identify flow (step 8) --------------------------------

from .services import identify as identify_service
from .services import llm


class VisionValidationTests(TestCase):
    def test_converts_to_zero_based_and_dedupes(self):
        self.assertEqual(llm._validate_vision({'ranked': [2, 2, 1], 'confidence': 0.8}, 3),
                         {'ranked': [1, 0], 'confidence': 0.8})

    def test_caps_at_three_and_clamps_confidence(self):
        out = llm._validate_vision({'ranked': [1, 2, 3, 4], 'confidence': 1.5}, 4)
        self.assertEqual(out, {'ranked': [0, 1, 2], 'confidence': 1.0})

    def test_empty_ranking_forces_zero_confidence(self):
        self.assertEqual(llm._validate_vision({'ranked': [], 'confidence': 0.9}, 3),
                         {'ranked': [], 'confidence': 0.0})

    def test_rejects_invented_index(self):
        for bad in ([0], [4], [True], ['1']):
            with self.assertRaises(ExternalAPIError):
                llm._validate_vision({'ranked': bad, 'confidence': 0.9}, 3)

    def test_rejects_wrong_shape(self):
        for bad in ({}, {'ranked': 1, 'confidence': 0.5}, {'ranked': [1]}, {'ranked': [1], 'confidence': 'high'}):
            with self.assertRaises(ExternalAPIError):
                llm._validate_vision(bad, 3)

    def test_missing_key_raises(self):
        with self.settings(LLM_API_KEY=''):
            with self.assertRaises(ExternalAPIError):
                llm.match_photo(b'x', [{'name': 'A', 'kind': 'k', 'distance_m': 1, 'direction': 'north'}], 0, 0)

    def test_unparseable_model_output_raises(self):
        reply = {'candidates': [{'content': {'parts': [{'text': 'not json'}]}}]}
        with self.settings(LLM_API_KEY='k'), umock.patch.object(llm, 'request_json', return_value=reply):
            with self.assertRaises(ExternalAPIError):
                llm.match_photo(b'x', [{'name': 'A', 'kind': 'k', 'distance_m': 1, 'direction': 'north'}], 0, 0)

    def test_full_call_parses_reply(self):
        reply = {'candidates': [{'content': {'parts': [{'text': '{"ranked": [1], "confidence": 0.75}'}]}}]}
        with self.settings(LLM_API_KEY='k'), umock.patch.object(llm, 'request_json', return_value=reply) as req:
            out = llm.match_photo(b'x', [{'name': 'A', 'kind': 'k', 'distance_m': 1, 'direction': 'north'}], 0, 0)
        self.assertEqual(out, {'ranked': [0], 'confidence': 0.75})
        body = req.call_args.kwargs['json']
        self.assertEqual(body['generationConfig']['responseMimeType'], 'application/json')
        self.assertIn('1. A', body['contents'][0]['parts'][0]['text'])


class PrepareImageTests(TestCase):
    def test_resizes_longest_side_to_1024(self):
        buf = io.BytesIO()
        Image.new('RGB', (4000, 3000), 'blue').save(buf, format='PNG')
        out = Image.open(io.BytesIO(llm.prepare_image(buf)))
        self.assertEqual(out.format, 'JPEG')
        self.assertEqual(out.size, (1024, 768))

    def test_small_images_are_not_upscaled(self):
        out = Image.open(io.BytesIO(llm.prepare_image(make_image())))
        self.assertEqual(out.size, (10, 10))


@umock.patch.object(identify_service.llm, 'match_photo')
@umock.patch.object(identify_service.candidate_service, 'get_candidates')
class IdentifyFlowTests(TestCase):
    lat, lng = 42.3600, -71.0600

    def setUp(self):
        def mk(eid, name, lat, lng):
            return Place.objects.create(external_id=eid, source='google', name=name, lat=lat, lng=lng)
        self.a = mk('a', 'North A', 42.3610, -71.0600)   # ~111m north
        self.b = mk('b', 'North B', 42.3620, -71.0600)   # ~222m north
        self.c = mk('c', 'North C', 42.3630, -71.0600)
        self.s = mk('s', 'South', 42.3590, -71.0600)     # behind when facing north
        self.all = [self.a, self.b, self.c, self.s]

    def run_identify(self, heading=0):
        return identify_service.identify(make_image(), self.lat, self.lng, heading)

    def test_matched(self, get_candidates, match):
        get_candidates.return_value = self.all
        match.return_value = {'ranked': [1, 0], 'confidence': 0.9}
        out = self.run_identify()
        self.assertEqual(out['status'], 'matched')
        self.assertEqual(out['place']['id'], self.b.id)
        self.assertEqual([c['id'] for c in out['candidates']], [self.b.id, self.a.id])
        self.assertEqual(out['confidence'], 0.9)

    def test_llm_only_sees_heading_filtered_candidates(self, get_candidates, match):
        get_candidates.return_value = self.all
        match.return_value = {'ranked': [0], 'confidence': 0.9}
        self.run_identify(heading=0)
        sent = match.call_args.args[1]
        self.assertEqual([c['name'] for c in sent], ['North A', 'North B', 'North C'])
        self.assertEqual(sent[0]['direction'], 'north')

    def test_ambiguous_returns_top_three(self, get_candidates, match):
        get_candidates.return_value = self.all
        match.return_value = {'ranked': [2], 'confidence': 0.5}
        out = self.run_identify()
        self.assertEqual(out['status'], 'ambiguous')
        self.assertEqual(out['place']['id'], self.c.id)
        self.assertEqual([c['id'] for c in out['candidates']], [self.c.id, self.a.id, self.b.id])

    def test_low_confidence_is_not_found(self, get_candidates, match):
        get_candidates.return_value = self.all
        match.return_value = {'ranked': [0], 'confidence': 0.2}
        out = self.run_identify()
        self.assertEqual(out['status'], 'not_found')
        self.assertIsNone(out['place'])
        self.assertEqual(len(out['candidates']), 3)

    def test_boundaries(self, get_candidates, match):
        get_candidates.return_value = self.all
        for conf, status in ((0.7, 'matched'), (0.4, 'ambiguous'), (0.39, 'not_found')):
            match.return_value = {'ranked': [0], 'confidence': conf}
            self.assertEqual(self.run_identify()['status'], status, conf)

    def test_vision_failure_falls_back_to_ambiguous(self, get_candidates, match):
        get_candidates.return_value = self.all
        match.side_effect = ExternalAPIError('down')
        out = self.run_identify()
        self.assertEqual(out['status'], 'ambiguous')
        self.assertIsNone(out['place'])
        self.assertEqual([c['id'] for c in out['candidates']], [self.a.id, self.b.id, self.c.id])
        self.assertEqual(out['confidence'], 0.0)

    def test_no_candidates_skips_llm(self, get_candidates, match):
        get_candidates.return_value = []
        out = self.run_identify()
        self.assertEqual(out, {'status': 'not_found', 'place': None, 'candidates': [], 'confidence': 0.0})
        match.assert_not_called()


# --- Search with caching (step 9) -----------------------------------------

from .models import TextSearchCache
from .services import search as search_service

SEARCH_RESULTS = [
    g('g_bpl', 'Boston Public Library', 42.3493, -71.0782),
    g('g_bpl_branch', 'Boston Public Library - West End', 42.3637, -71.0661),
    g('g_bpl', 'Boston Public Library', 42.3493, -71.0782),  # duplicate from Google
]


@umock.patch.object(search_service.google_places, 'text_search')
class SearchServiceTests(APITestCase):
    url = '/api/places/search/'

    def get(self, **params):
        return self.client.get(self.url, {'q': '  Boston   PUBLIC library ', **params})

    def test_normalize_query(self, _):
        self.assertEqual(search_service.normalize_query('  Faneuil   HALL '), 'faneuil hall')

    def test_miss_calls_google_upserts_and_caches_in_order(self, text_search):
        text_search.return_value = SEARCH_RESULTS
        response = self.get(lat=42.35, lng=-71.06)
        self.assertEqual(response.status_code, 200)
        results = response.json()['results']
        self.assertEqual([r['name'] for r in results],
                         ['Boston Public Library', 'Boston Public Library - West End'])
        self.assertEqual(set(results[0]), {'id', 'name', 'address', 'lat', 'lng'})
        text_search.assert_called_once_with('boston public library', 42.35, -71.06,
                                            max_results=search_service.MAX_RESULTS)
        self.assertEqual(Place.objects.count(), 2)
        self.assertTrue(TextSearchCache.objects.filter(query='boston public library').exists())

    def test_order_survives_cache(self, text_search):
        text_search.return_value = list(reversed(SEARCH_RESULTS[:2]))
        first = [r['id'] for r in self.get().json()['results']]
        second = [r['id'] for r in self.get().json()['results']]
        self.assertEqual(first, second)
        self.assertEqual(text_search.call_count, 1)

    def test_hit_skips_google(self, text_search):
        text_search.return_value = SEARCH_RESULTS
        self.get()
        self.client.get(self.url, {'q': 'boston public LIBRARY'})
        self.assertEqual(text_search.call_count, 1)

    def test_no_location_passes_none(self, text_search):
        text_search.return_value = []
        self.assertEqual(self.get().json(), {'results': []})
        text_search.assert_called_once_with('boston public library', None, None,
                                            max_results=search_service.MAX_RESULTS)

    def test_expired_cache_refetches_and_replaces(self, text_search):
        text_search.return_value = SEARCH_RESULTS
        self.get()
        TextSearchCache.objects.update(created_at=timezone.now() - timedelta(days=8))
        text_search.return_value = SEARCH_RESULTS[1:2]
        results = self.get().json()['results']
        self.assertEqual([r['name'] for r in results], ['Boston Public Library - West End'])
        self.assertEqual(text_search.call_count, 2)

    def test_google_failure_without_cache_is_502(self, text_search):
        text_search.side_effect = ExternalAPIError('boom')
        response = self.get()
        self.assertEqual(response.status_code, 502)
        self.assertIn('detail', response.json())
        self.assertFalse(TextSearchCache.objects.exists())

    def test_google_failure_with_stale_cache_serves_it(self, text_search):
        text_search.return_value = SEARCH_RESULTS
        self.get()
        TextSearchCache.objects.update(created_at=timezone.now() - timedelta(days=8))
        text_search.side_effect = ExternalAPIError('boom')
        response = self.get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['results']), 2)


# --- Place card (step 10) -------------------------------------------------

from .models import PlaceCard
from .services import place_card as card_service

CARD_KEYS = {'id', 'name', 'bio', 'rating', 'rating_count', 'price_range', 'hours',
             'nearest_t', 'friends_interested', 'saved'}
NEAREST_T = {'stop': 'State', 'lines': ['Orange', 'Blue'], 'walk_min': 4}
DETAILS = {
    'rating': 4.5, 'rating_count': 48210, 'price_level': 'PRICE_LEVEL_MODERATE',
    'opening_hours': ['Monday: 10:00 AM - 9:00 PM'],
}


@umock.patch.object(card_service.llm, 'write_bio', return_value='A historic market hall.')
@umock.patch.object(card_service.wiki, 'summary', return_value='Faneuil Hall is a marketplace.')
@umock.patch.object(card_service.wiki, 'geosearch')
@umock.patch.object(card_service.google_places, 'place_details', return_value=DETAILS)
class PlaceCardTests(APITestCase):
    def setUp(self):
        self.place = Place.objects.create(
            external_id='g_faneuil', source='google', name='Faneuil Hall Marketplace',
            address='4 S Market St', lat=42.3600, lng=-71.0568,
            types=['tourist_attraction', 'market'], raw_data={'primaryType': 'market'},
        )
        self.url = f'/api/places/{self.place.id}/'
        patcher = umock.patch.object(card_service.mbta, 'nearest_stop', return_value=NEAREST_T)
        self.nearest = patcher.start()
        self.addCleanup(patcher.stop)

    def test_first_open_fetches_everything_and_caches(self, details, geo, summary, bio):
        geo.return_value = [w(1, 'Faneuil Hall', 42.3601, -71.0567)]
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(set(body), CARD_KEYS)
        self.assertEqual(body['bio'], 'A historic market hall.')
        self.assertEqual(body['rating'], 4.5)
        self.assertEqual(body['price_range'], '$$')
        self.assertEqual(body['hours'], ['Monday: 10:00 AM - 9:00 PM'])
        self.assertEqual(body['nearest_t'], NEAREST_T)
        self.assertEqual(body['friends_interested'], 0)
        self.assertIsNone(body['saved'])

        details.assert_called_once_with('g_faneuil')
        self.nearest.assert_called_once_with(42.3600, -71.0568)
        summary.assert_called_once_with('Faneuil Hall')
        facts = bio.call_args.args[0]
        self.assertEqual(facts['wikipedia_summary'], 'Faneuil Hall is a marketplace.')
        self.assertEqual(facts['kind'], 'market')

        self.place.refresh_from_db()
        self.assertEqual(self.place.wiki_title, 'Faneuil Hall')
        self.assertIsNotNone(self.place.details_fetched_at)
        self.assertTrue(PlaceCard.objects.filter(place=self.place).exists())

    def test_second_open_makes_no_external_calls(self, details, geo, summary, bio):
        geo.return_value = []
        self.client.get(self.url)
        for m in (details, geo, summary, bio, self.nearest):
            m.reset_mock()
        body = self.client.get(self.url).json()
        self.assertEqual(body['bio'], 'A historic market hall.')
        self.assertEqual(body['nearest_t'], NEAREST_T)
        for m in (details, geo, summary, bio, self.nearest):
            m.assert_not_called()

    def test_stale_details_are_refreshed(self, details, geo, summary, bio):
        geo.return_value = []
        self.client.get(self.url)
        Place.objects.update(details_fetched_at=timezone.now() - timedelta(days=8))
        details.return_value = {**DETAILS, 'rating': 4.7}
        bio.reset_mock()
        self.assertEqual(self.client.get(self.url).json()['rating'], 4.7)
        self.assertEqual(details.call_count, 2)
        bio.assert_not_called()

    def test_wiki_place_skips_details_and_uses_its_title(self, details, geo, summary, bio):
        place = Place.objects.create(external_id='wiki:5', source='wiki', name='Boston Common',
                                     lat=42.3551, lng=-71.0657, wiki_title='Boston Common')
        body = self.client.get(f'/api/places/{place.id}/').json()
        for key in ('rating', 'rating_count', 'price_range', 'hours'):
            self.assertIsNone(body[key])
        details.assert_not_called()
        geo.assert_not_called()
        summary.assert_called_once_with('Boston Common')

    def test_details_failure_returns_nulls(self, details, geo, summary, bio):
        details.side_effect = ExternalAPIError('down')
        geo.return_value = []
        body = self.client.get(self.url).json()
        self.assertIsNone(body['rating'])
        self.assertIsNone(body['hours'])
        self.assertEqual(body['bio'], 'A historic market hall.')
        self.place.refresh_from_db()
        self.assertIsNone(self.place.details_fetched_at)  # retried next open

    def test_bio_failure_falls_back_to_wiki_and_does_not_cache(self, details, geo, summary, bio):
        geo.return_value = [w(1, 'Faneuil Hall', 42.3601, -71.0567)]
        bio.side_effect = ExternalAPIError('down')
        body = self.client.get(self.url).json()
        self.assertEqual(body['bio'], 'Faneuil Hall is a marketplace.')
        self.assertFalse(PlaceCard.objects.exists())

        bio.side_effect = None
        self.assertEqual(self.client.get(self.url).json()['bio'], 'A historic market hall.')
        self.assertTrue(PlaceCard.objects.exists())

    def test_wikipedia_failure_still_writes_bio(self, details, geo, summary, bio):
        geo.side_effect = ExternalAPIError('down')
        body = self.client.get(self.url).json()
        self.assertEqual(body['bio'], 'A historic market hall.')
        self.assertNotIn('wikipedia_summary', bio.call_args.args[0])
        self.assertFalse(PlaceCard.objects.exists())  # rewritten once Wikipedia is back

        geo.side_effect = None
        geo.return_value = [w(1, 'Faneuil Hall', 42.3601, -71.0567)]
        self.client.get(self.url)
        self.assertEqual(bio.call_args.args[0]['wikipedia_summary'], 'Faneuil Hall is a marketplace.')
        self.assertTrue(PlaceCard.objects.exists())

    def test_prefers_exact_name_over_closer_partial_match(self, details, geo, summary, bio):
        geo.return_value = [w(1, 'Faneuil Hall Marketplace fire', 42.3600, -71.0568),  # closer
                            w(2, 'Faneuil Hall Marketplace', 42.3605, -71.0568)]
        self.client.get(self.url)
        summary.assert_called_once_with('Faneuil Hall Marketplace')

    def test_subtopic_article_prefers_the_exact_title(self, details, geo, summary, bio):
        geo.return_value = [w(1, 'Faneuil Hall Marketplace fire', 42.3600, -71.0568)]
        self.client.get(self.url)
        summary.assert_called_once_with('Faneuil Hall Marketplace')
        self.place.refresh_from_db()
        self.assertEqual(self.place.wiki_title, 'Faneuil Hall Marketplace')

    def test_subtopic_article_is_kept_if_no_exact_title(self, details, geo, summary, bio):
        geo.return_value = [w(1, 'Faneuil Hall Marketplace fire', 42.3600, -71.0568)]

        def fake_summary(title):
            if title == 'Faneuil Hall Marketplace':
                raise ExternalAPIError('404')  # no article with the exact name
            return 'A fire.'
        summary.side_effect = fake_summary
        self.client.get(self.url)
        self.place.refresh_from_db()
        self.assertEqual(self.place.wiki_title, 'Faneuil Hall Marketplace fire')
        self.assertTrue(PlaceCard.objects.exists())

    def test_unrelated_nearby_article_is_ignored(self, details, geo, summary, bio):
        geo.return_value = [w(9, 'Quincy Market', 42.3601, -71.0560)]
        self.client.get(self.url)
        summary.assert_not_called()

    def test_unknown_place_is_404(self, *_):
        self.assertEqual(self.client.get('/api/places/9999/').status_code, 404)

    def test_mbta_failure_is_null_and_retried_on_cached_card(self, details, geo, summary, bio):
        geo.return_value = []
        self.nearest.side_effect = ExternalAPIError('down')
        body = self.client.get(self.url).json()
        self.assertIsNone(body['nearest_t'])
        self.assertTrue(PlaceCard.objects.exists())  # bio still cached

        self.nearest.side_effect = None
        bio.reset_mock()
        self.assertEqual(self.client.get(self.url).json()['nearest_t'], NEAREST_T)
        self.assertEqual(PlaceCard.objects.get().nearest_t, NEAREST_T)
        bio.assert_not_called()

    def test_no_stop_nearby_is_null_and_not_asked_again(self, details, geo, summary, bio):
        geo.return_value = []
        self.nearest.return_value = None
        self.assertIsNone(self.client.get(self.url).json()['nearest_t'])
        self.assertIsNone(self.client.get(self.url).json()['nearest_t'])
        self.assertEqual(self.nearest.call_count, 1)


from .services import mbta


def stop(name, lat, lng, parent='place-state'):
    rel = {'parent_station': {'data': {'id': parent, 'type': 'stop'}}} if parent else {}
    return {'id': '70042', 'attributes': {'name': name, 'latitude': lat, 'longitude': lng},
            'relationships': rel}


class MbtaTests(TestCase):
    def call(self, responses):
        with umock.patch.object(mbta, 'request_json', side_effect=responses) as req:
            return mbta.nearest_stop(42.3600, -71.0568), req

    def test_nearest_stop_with_lines(self):
        routes = {'data': [{'id': 'Orange'}, {'id': 'Green-B'}, {'id': 'Green-C'}]}
        out, req = self.call([{'data': [stop('State', 42.358978, -71.057598)]}, routes])
        self.assertEqual(out['stop'], 'State')
        self.assertEqual(out['lines'], ['Orange', 'Green'])
        self.assertEqual(out['walk_min'], 3)  # ~130m straight line, padded 1.3x at 80m/min
        self.assertEqual(req.call_args_list[1].kwargs['params']['filter[stop]'], 'place-state')

    def test_stop_without_parent_uses_its_own_id(self):
        out, req = self.call([{'data': [stop('X', 42.36, -71.0568, parent=None)]}, {'data': []}])
        self.assertEqual(req.call_args_list[1].kwargs['params']['filter[stop]'], '70042')
        self.assertEqual(out['walk_min'], 1)

    def test_no_stops_returns_none(self):
        out, req = self.call([{'data': []}])
        self.assertIsNone(out)
        self.assertEqual(req.call_count, 1)

    def test_bad_shape_raises(self):
        with self.assertRaises(ExternalAPIError):
            self.call([{'data': [{'id': '1', 'attributes': {}}]}])

    def test_walk_minutes(self):
        self.assertEqual(mbta.walk_minutes(0), 1)
        self.assertEqual(mbta.walk_minutes(400), 7)


class BioValidationTests(TestCase):
    def test_collapses_whitespace(self):
        self.assertEqual(llm._validate_bio({'bio': '  A  place.\n Nice. '}), 'A place. Nice.')

    def test_rejects_bad_shapes(self):
        for data in ({}, {'bio': ''}, {'bio': '   '}, {'bio': 3}, {'bio': 'x' * 900}):
            with self.assertRaises(ExternalAPIError):
                llm._validate_bio(data)

    def test_prompt_contains_facts(self):
        with self.settings(LLM_API_KEY='k'), umock.patch.object(llm, '_generate', return_value={'bio': 'Hi.'}) as gen:
            self.assertEqual(llm.write_bio({'name': 'Old State House'}), 'Hi.')
        self.assertIn('Old State House', gen.call_args.kwargs['parts'][0]['text'])


# --- Error handling (step 12) ---------------------------------------------

from .services import google_places, http, wiki as wiki_service
from .services import identify as identify_svc


class ResponseShapeTests(TestCase):
    def test_non_object_json_is_an_api_error(self):
        resp = umock.Mock(status_code=200, **{'json.return_value': ['not', 'a', 'dict']})
        with umock.patch.object(http.requests, 'request', return_value=resp):
            with self.assertRaises(ExternalAPIError):
                http.request_json('GET', 'https://x', label='t')

    def test_google_skips_malformed_places(self):
        data = {'places': [
            {'id': 'ok', 'displayName': {'text': 'Good'}, 'location': {'latitude': 42.0, 'longitude': -71.0}},
            {'displayName': {'text': 'No id'}, 'location': {'latitude': 42.0, 'longitude': -71.0}},
            {'id': 'noloc', 'displayName': {'text': 'No location'}},
            {'id': 'badlat', 'displayName': {'text': 'Bad'}, 'location': {'latitude': 'x', 'longitude': 1}},
            'not a dict',
        ]}
        self.assertEqual([p['external_id'] for p in google_places._normalize_list(data)], ['ok'])
        self.assertEqual(google_places._normalize_list({'places': 'nope'}), [])

    def test_google_details_with_wrong_types_become_none(self):
        bad = {'rating': 'great', 'userRatingCount': True, 'priceLevel': 3,
               'regularOpeningHours': {'weekdayDescriptions': 'Mon 9-5'}}
        with self.settings(GOOGLE_PLACES_KEY='k'), \
                umock.patch.object(google_places, 'request_json', return_value=bad):
            self.assertEqual(google_places.place_details('x'), {
                'rating': None, 'rating_count': None, 'price_level': None, 'opening_hours': None})

    def test_wiki_skips_malformed_pages(self):
        data = {'query': {'geosearch': [
            {'pageid': 1, 'title': 'Good', 'lat': 42.0, 'lon': -71.0},
            {'title': 'No id', 'lat': 42.0, 'lon': -71.0},
            {'pageid': 3, 'title': 'No coords'},
        ]}}
        with umock.patch.object(wiki_service, 'request_json', return_value=data):
            self.assertEqual([p['name'] for p in wiki_service.geosearch(42, -71)], ['Good'])

    def test_long_names_are_clipped_on_upsert(self):
        item = g('long', 'x' * 400, 42.0, -71.0)
        place = candidates.upsert_places([item])[0]
        self.assertEqual(len(place.name), 255)


class UnexpectedErrorTests(APITestCase):
    """A bug inside a service call falls back like an upstream failure would."""

    def test_candidates_survive_a_crashing_source(self):
        with umock.patch.object(candidates.google_places, 'nearby_search', side_effect=KeyError('id')), \
                umock.patch.object(candidates.wiki, 'geosearch', return_value=WIKI_RESULTS):
            places = candidates.get_candidates(42.3600, -71.0568)
        self.assertEqual(len(places), 2)
        self.assertFalse(NearbySearchCache.objects.exists())

    def test_identify_survives_a_crashing_vision_call(self):
        place = Place.objects.create(external_id='a', source='google', name='A', lat=42.361, lng=-71.06)
        with umock.patch.object(identify_svc.candidate_service, 'get_candidates', return_value=[place]), \
                umock.patch.object(identify_svc.llm, 'match_photo', side_effect=TypeError('bug')):
            out = identify_svc.identify(make_image(), 42.36, -71.06, 0)
        self.assertEqual(out['status'], 'ambiguous')

    def test_card_survives_crashing_services(self):
        place = Place.objects.create(external_id='g', source='google', name='Spot', lat=42.36, lng=-71.06)
        boom = umock.Mock(side_effect=RuntimeError('bug'))
        with umock.patch.object(card_service.google_places, 'place_details', boom), \
                umock.patch.object(card_service.wiki, 'geosearch', boom), \
                umock.patch.object(card_service.mbta, 'nearest_stop', boom), \
                umock.patch.object(card_service.llm, 'write_bio', boom):
            response = self.client.get(f'/api/places/{place.id}/')
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['bio'], '')
        self.assertIsNone(body['rating'])
        self.assertIsNone(body['nearest_t'])

    def test_search_crash_is_502(self):
        with umock.patch.object(search_service.google_places, 'text_search', side_effect=KeyError('x')):
            response = self.client.get('/api/places/search/', {'q': 'anything'})
        self.assertEqual(response.status_code, 502)
        self.assertIn('detail', response.json())

    def test_unhandled_view_error_is_json_500(self):
        place = Place.objects.create(external_id='g2', source='google', name='Spot', lat=42.36, lng=-71.06)
        self.client.raise_request_exception = False
        with umock.patch('app.views.get_card', side_effect=RuntimeError('bug')):
            response = self.client.get(f'/api/places/{place.id}/')
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json(), {'detail': 'Something went wrong. Please try again.'})

    def test_unknown_url_is_json_404(self):
        response = self.client.get('/api/does-not-exist/')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {'detail': 'Not found.'})

    def test_oversized_image_is_400(self):
        image = make_image()
        image.size = 16 * 1024 * 1024
        with umock.patch('app.serializers.serializers.ImageField.to_internal_value', return_value=image):
            response = self.client.post('/api/identify/', {'image': make_image(), 'lat': 42.36, 'lng': -71.06})
        self.assertEqual(response.status_code, 400)
        self.assertIn('image', response.json())


# --- warm_cache command (step 13) -----------------------------------------

from django.core.management import call_command

from .management.commands import warm_cache


class WarmCacheTests(TestCase):
    def setUp(self):
        self.places = [
            Place.objects.create(external_id=f'p{i}', source='google', name=f'P{i}', lat=42.36, lng=-71.06)
            for i in range(5)
        ]
        patches = {
            'candidates': umock.patch.object(warm_cache, 'get_candidates', side_effect=self.fake_candidates),
            'search': umock.patch.object(warm_cache, 'search_places', return_value=self.places[3:]),
            'card': umock.patch.object(warm_cache, 'get_card', side_effect=self.fake_card),
        }
        self.mocks = {name: p.start() for name, p in patches.items()}
        for p in patches.values():
            self.addCleanup(p.stop)

    def fake_candidates(self, lat, lng):
        NearbySearchCache.objects.get_or_create(grid_key=candidates.grid_key(lat, lng))
        return self.places

    def fake_card(self, place):
        PlaceCard.objects.get_or_create(place=place, defaults={'bio': 'b', 'nearest_t': {}})
        return {'rating': None, 'nearest_t': None}

    def run_cmd(self, *args):
        out = io.StringIO()
        call_command('warm_cache', *args, stdout=out)
        return out.getvalue()

    def test_warms_spots_with_neighbors_searches_and_cards(self):
        out = self.run_cmd()
        self.assertEqual(self.mocks['candidates'].call_count, len(warm_cache.SPOTS) * 9)
        self.assertEqual(self.mocks['search'].call_count, len(warm_cache.SEARCHES))
        # Closest 3 per spot (P0-P2) + top search result (P3), each built once.
        self.assertEqual([c.args[0].name for c in self.mocks['card'].call_args_list], ['P0', 'P1', 'P2', 'P3'])
        self.assertIn('Everything is cached.', out)

    def test_flags(self):
        self.run_cmd('--no-cards', '--no-neighbors', '--only-spots')
        self.assertEqual(self.mocks['candidates'].call_count, len(warm_cache.SPOTS))
        self.mocks['search'].assert_not_called()
        self.mocks['card'].assert_not_called()

    def test_reports_cards_that_need_a_rerun(self):
        self.mocks['card'].side_effect = lambda place: {'rating': None, 'nearest_t': None}
        out = self.run_cmd('--only-search')
        self.assertIn('1 incomplete: P3', out)

    def test_reports_cells_that_did_not_cache(self):
        self.mocks['candidates'].side_effect = lambda lat, lng: self.places  # saves nothing
        out = self.run_cmd('--only-spots', '--no-cards', '--no-neighbors')
        self.assertIn('(1 cells not cached)', out)
        self.assertIn(f'{len(warm_cache.SPOTS)} incomplete', out)

    def test_search_failure_does_not_stop_the_run(self):
        self.mocks['search'].side_effect = ExternalAPIError('down')
        out = self.run_cmd('--only-search', '--no-cards')
        self.assertIn('failed', out)
        self.assertIn('Everything is cached.', out)


# --- Accounts (step 14) ---------------------------------------------------

import datetime

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.authtoken.models import Token

from .models import Circle, CircleMembership, PlaceList, SavedPlace

GOOD_PASSWORD = 'walk-the-freedom-trail'


class AuthTests(APITestCase):
    def test_register_returns_token_and_user(self):
        response = self.client.post('/api/auth/register/',
                                    {'username': 'matt', 'password': GOOD_PASSWORD, 'email': 'm@example.com'})
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(set(body), {'token', 'user'})
        self.assertEqual(body['user']['username'], 'matt')
        self.assertEqual(Token.objects.get(user__username='matt').key, body['token'])

    def test_register_rejects_taken_username_ignoring_case(self):
        User.objects.create_user('Matt', password=GOOD_PASSWORD)
        response = self.client.post('/api/auth/register/', {'username': 'matt', 'password': GOOD_PASSWORD})
        self.assertEqual(response.status_code, 400)
        self.assertIn('username', response.json())

    def test_register_rejects_weak_password(self):
        response = self.client.post('/api/auth/register/', {'username': 'matt', 'password': '123'})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(username='matt').exists())

    def test_login_and_me(self):
        User.objects.create_user('Matt', password=GOOD_PASSWORD)
        response = self.client.post('/api/auth/login/', {'username': 'matt', 'password': GOOD_PASSWORD})
        self.assertEqual(response.status_code, 200)
        token = response.json()['token']

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')
        me = self.client.get('/api/me/')
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()['username'], 'Matt')

    def test_login_wrong_password(self):
        User.objects.create_user('matt', password=GOOD_PASSWORD)
        response = self.client.post('/api/auth/login/', {'username': 'matt', 'password': 'nope'})
        self.assertEqual(response.status_code, 400)

    def test_me_requires_login(self):
        self.assertEqual(self.client.get('/api/me/').status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION='Token bogus')
        self.assertEqual(self.client.get('/api/me/').status_code, 401)

    def test_place_apis_still_work_without_login(self):
        self.assertEqual(self.client.get('/api/health/').status_code, 200)


# --- Saved places (step 15) -----------------------------------------------

SAVED_KEYS = {'id', 'place', 'visited', 'visited_at', 'note', 'visibility', 'circle_id', 'created_at'}
LIST_KEYS = {'id', 'name', 'description', 'visibility', 'circle_id', 'items', 'visited_count', 'total_count'}


class LoggedInTestCase(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('matt', password=GOOD_PASSWORD)
        self.other = User.objects.create_user('sam', password=GOOD_PASSWORD)
        self.client.force_authenticate(self.user)
        self.place = Place.objects.create(external_id='g1', source='google', name='Faneuil Hall', lat=42.36, lng=-71.056)
        self.place2 = Place.objects.create(external_id='g2', source='google', name='Boston Common', lat=42.355, lng=-71.066)

    def make_circle(self, owner, *members):
        circle = Circle.objects.create(name='Crew', owner=owner)
        CircleMembership.objects.create(circle=circle, user=owner, role=CircleMembership.ROLE_OWNER)
        for m in members:
            CircleMembership.objects.create(circle=circle, user=m)
        return circle


class SavedPlaceTests(LoggedInTestCase):
    def test_save_returns_contract_shape(self):
        response = self.client.post('/api/saved/', {'place_id': self.place.id})
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(set(body), SAVED_KEYS)
        self.assertEqual(set(body['place']), SHORT_PLACE_KEYS)
        self.assertEqual(body['visibility'], 'private')
        self.assertFalse(body['visited'])
        self.assertIsNone(body['visited_at'])

    def test_saving_twice_returns_the_existing_one(self):
        first = self.client.post('/api/saved/', {'place_id': self.place.id, 'note': 'go here'}).json()
        again = self.client.post('/api/saved/', {'place_id': self.place.id})
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()['id'], first['id'])
        self.assertEqual(again.json()['note'], 'go here')
        self.assertEqual(SavedPlace.objects.count(), 1)

    def test_unknown_place(self):
        response = self.client.post('/api/saved/', {'place_id': 9999})
        self.assertEqual(response.status_code, 400)

    def test_requires_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/saved/').status_code, 401)

    def test_list_only_shows_mine_and_filters_visited(self):
        SavedPlace.objects.create(user=self.user, place=self.place, visited=True, visited_at=datetime.date(2026, 5, 1))
        SavedPlace.objects.create(user=self.user, place=self.place2)
        SavedPlace.objects.create(user=self.other, place=self.place)
        self.assertEqual(len(self.client.get('/api/saved/').json()['results']), 2)
        visited = self.client.get('/api/saved/?visited=true').json()['results']
        self.assertEqual([s['place']['name'] for s in visited], ['Faneuil Hall'])
        self.assertEqual(len(self.client.get('/api/saved/?visited=false').json()['results']), 1)

    def test_mark_visited_with_date(self):
        saved = SavedPlace.objects.create(user=self.user, place=self.place)
        response = self.client.patch(f'/api/saved/{saved.id}/', {'visited_at': '2025-07-04'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['visited'])
        self.assertEqual(response.json()['visited_at'], '2025-07-04')

    def test_mark_visited_defaults_to_today_and_unvisit_clears(self):
        saved = SavedPlace.objects.create(user=self.user, place=self.place)
        body = self.client.patch(f'/api/saved/{saved.id}/', {'visited': True}).json()
        self.assertEqual(body['visited_at'], timezone.localdate().isoformat())
        body = self.client.patch(f'/api/saved/{saved.id}/', {'visited': False}).json()
        self.assertFalse(body['visited'])
        self.assertIsNone(body['visited_at'])

    def test_visit_date_rules(self):
        saved = SavedPlace.objects.create(user=self.user, place=self.place)
        future = (timezone.localdate() + datetime.timedelta(days=2)).isoformat()
        self.assertEqual(self.client.patch(f'/api/saved/{saved.id}/', {'visited_at': future}).status_code, 400)
        response = self.client.patch(f'/api/saved/{saved.id}/', {'visited': False, 'visited_at': '2025-01-01'})
        self.assertEqual(response.status_code, 400)

    def test_cant_change_place(self):
        saved = SavedPlace.objects.create(user=self.user, place=self.place)
        response = self.client.patch(f'/api/saved/{saved.id}/', {'place_id': self.place2.id})
        self.assertEqual(response.status_code, 400)

    def test_other_users_saved_place_is_404(self):
        theirs = SavedPlace.objects.create(user=self.other, place=self.place)
        self.assertEqual(self.client.patch(f'/api/saved/{theirs.id}/', {'note': 'x'}).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/saved/{theirs.id}/').status_code, 404)
        self.assertTrue(SavedPlace.objects.filter(pk=theirs.id).exists())

    def test_unsave_removes_from_lists(self):
        saved = SavedPlace.objects.create(user=self.user, place=self.place)
        place_list = PlaceList.objects.create(owner=self.user, name='Todo')
        place_list.items.add(saved)
        self.assertEqual(self.client.delete(f'/api/saved/{saved.id}/').status_code, 204)
        self.assertEqual(place_list.items.count(), 0)

    def test_circle_visibility(self):
        saved = SavedPlace.objects.create(user=self.user, place=self.place)
        url = f'/api/saved/{saved.id}/'
        mine = self.make_circle(self.user)
        not_mine = self.make_circle(self.other)

        self.assertEqual(self.client.patch(url, {'visibility': 'circle'}).status_code, 400)
        self.assertEqual(self.client.patch(url, {'visibility': 'circle', 'circle_id': not_mine.id}).status_code, 400)
        body = self.client.patch(url, {'visibility': 'circle', 'circle_id': mine.id}).json()
        self.assertEqual(body['circle_id'], mine.id)
        # Editing something else keeps the circle; switching visibility clears it.
        self.assertEqual(self.client.patch(url, {'note': 'hi'}).json()['circle_id'], mine.id)
        body = self.client.patch(url, {'visibility': 'friends'}).json()
        self.assertEqual(body['visibility'], 'friends')
        self.assertIsNone(body['circle_id'])

    def test_member_can_share_with_circle(self):
        circle = self.make_circle(self.other, self.user)
        response = self.client.post('/api/saved/', {'place_id': self.place.id, 'visibility': 'circle',
                                                    'circle_id': circle.id})
        self.assertEqual(response.status_code, 201)


@umock.patch.object(card_service, '_fetch_details', return_value=None)
@umock.patch.object(card_service, '_fetch_wiki', return_value=None)
@umock.patch.object(card_service, '_fetch_nearest_t', return_value={})
@umock.patch.object(card_service.llm, 'write_bio', return_value='bio')
class PlaceCardSavedTests(LoggedInTestCase):
    def test_card_shows_my_saved_place(self, *mocks):
        saved = SavedPlace.objects.create(user=self.user, place=self.place, visited=True,
                                          visited_at=datetime.date(2026, 3, 2))
        body = self.client.get(f'/api/places/{self.place.id}/').json()
        self.assertEqual(body['saved'], {'id': saved.id, 'visited': True, 'visited_at': '2026-03-02'})

    def test_card_ignores_other_users_saves(self, *mocks):
        SavedPlace.objects.create(user=self.other, place=self.place)
        self.assertIsNone(self.client.get(f'/api/places/{self.place.id}/').json()['saved'])
        self.client.force_authenticate(None)
        self.assertIsNone(self.client.get(f'/api/places/{self.place.id}/').json()['saved'])


# --- Lists (step 16) ------------------------------------------------------

class PlaceListTests(LoggedInTestCase):
    def create_list(self, **extra):
        response = self.client.post('/api/lists/', {'name': 'Date ideas', **extra})
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_create_returns_contract_shape(self):
        body = self.create_list(description='cute spots', visibility='friends')
        self.assertEqual(set(body), LIST_KEYS)
        self.assertEqual(body['items'], [])
        self.assertEqual((body['visited_count'], body['total_count']), (0, 0))
        self.assertEqual(body['visibility'], 'friends')

    def test_name_required(self):
        self.assertEqual(self.client.post('/api/lists/', {}).status_code, 400)

    def test_add_item_saves_the_place_first(self):
        lst = self.create_list()
        response = self.client.post(f'/api/lists/{lst["id"]}/items/', {'place_id': self.place.id})
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['total_count'], 1)
        self.assertEqual(set(body['items'][0]), SAVED_KEYS)
        self.assertTrue(SavedPlace.objects.filter(user=self.user, place=self.place).exists())

        again = self.client.post(f'/api/lists/{lst["id"]}/items/', {'place_id': self.place.id})
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()['total_count'], 1)

    def test_add_item_reuses_existing_saved_place_and_counts_visited(self):
        saved = SavedPlace.objects.create(user=self.user, place=self.place, visited=True,
                                          visited_at=datetime.date(2026, 1, 1))
        lst = self.create_list()
        self.client.post(f'/api/lists/{lst["id"]}/items/', {'place_id': self.place.id})
        body = self.client.post(f'/api/lists/{lst["id"]}/items/', {'place_id': self.place2.id}).json()
        self.assertEqual(SavedPlace.objects.filter(user=self.user).count(), 2)
        self.assertIn(saved.id, [i['id'] for i in body['items']])
        self.assertEqual((body['visited_count'], body['total_count']), (1, 2))

    def test_remove_item_keeps_it_saved(self):
        lst = self.create_list()
        body = self.client.post(f'/api/lists/{lst["id"]}/items/', {'place_id': self.place.id}).json()
        saved_id = body['items'][0]['id']
        self.assertEqual(self.client.delete(f'/api/lists/{lst["id"]}/items/{saved_id}/').status_code, 204)
        self.assertEqual(self.client.get(f'/api/lists/{lst["id"]}/').json()['total_count'], 0)
        self.assertTrue(SavedPlace.objects.filter(pk=saved_id).exists())
        self.assertEqual(self.client.delete(f'/api/lists/{lst["id"]}/items/{saved_id}/').status_code, 404)

    def test_edit_and_delete(self):
        lst = self.create_list()
        body = self.client.patch(f'/api/lists/{lst["id"]}/', {'name': 'Renamed', 'visibility': 'public'}).json()
        self.assertEqual((body['name'], body['visibility']), ('Renamed', 'public'))
        self.assertEqual(self.client.delete(f'/api/lists/{lst["id"]}/').status_code, 204)
        self.assertFalse(PlaceList.objects.exists())

    def test_index_only_shows_mine(self):
        self.create_list()
        PlaceList.objects.create(owner=self.other, name='Theirs', visibility='public')
        names = [l['name'] for l in self.client.get('/api/lists/').json()['results']]
        self.assertEqual(names, ['Date ideas'])

    def test_other_users_list_is_404(self):
        theirs = PlaceList.objects.create(owner=self.other, name='Theirs', visibility='public')
        base = f'/api/lists/{theirs.id}/'
        self.assertEqual(self.client.get(base).status_code, 404)
        self.assertEqual(self.client.patch(base, {'name': 'x'}).status_code, 404)
        self.assertEqual(self.client.delete(base).status_code, 404)
        self.assertEqual(self.client.post(base + 'items/', {'place_id': self.place.id}).status_code, 404)
        self.assertFalse(SavedPlace.objects.filter(user=self.user).exists())

    def test_circle_visibility_needs_my_circle(self):
        self.assertEqual(self.client.post('/api/lists/', {'name': 'x', 'visibility': 'circle'}).status_code, 400)
        circle = self.make_circle(self.user)
        body = self.create_list(visibility='circle', circle_id=circle.id)
        self.assertEqual(body['circle_id'], circle.id)

    def test_index_query_count_is_flat(self):
        for i in range(3):
            lst = PlaceList.objects.create(owner=self.user, name=f'L{i}')
            lst.items.add(SavedPlace.objects.get_or_create(user=self.user, place=self.place)[0],
                          SavedPlace.objects.get_or_create(user=self.user, place=self.place2)[0])
        with self.assertNumQueries(3):  # lists, items, places
            self.client.get('/api/lists/')
