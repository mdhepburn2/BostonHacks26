import io

from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APITestCase


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
    url = '/api/identify/'

    def test_returns_contract_shape(self):
        response = self.client.post(
            self.url,
            {'image': make_image(), 'lat': 42.3601, 'lng': -71.0567, 'heading': 90},
            format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(set(body), {'status', 'place', 'candidates', 'confidence'})
        self.assertIn(body['status'], {'matched', 'ambiguous', 'not_found'})
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

    def test_returns_contract_shape(self):
        response = self.client.get(self.url, {'q': '  Faneuil   HALL '})
        self.assertEqual(response.status_code, 200)
        results = response.json()['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(set(results[0]), {'id', 'name', 'address', 'lat', 'lng'})

    def test_no_match_returns_empty_list(self):
        response = self.client.get(self.url, {'q': 'zzz nothing'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'results': []})

    def test_missing_query_is_400(self):
        self.assertEqual(self.client.get(self.url).status_code, 400)

    def test_lat_without_lng_is_400(self):
        self.assertEqual(self.client.get(self.url, {'q': 'library', 'lat': 42.36}).status_code, 400)


class PlaceCardTests(APITestCase):
    def test_returns_contract_shape(self):
        response = self.client.get('/api/places/1/')
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(
            set(body),
            {'id', 'name', 'bio', 'rating', 'rating_count', 'price_range', 'hours',
             'nearest_t', 'friends_interested', 'saved'},
        )
        self.assertEqual(set(body['nearest_t']), {'stop', 'lines', 'walk_min'})
        self.assertEqual(body['friends_interested'], 0)
        self.assertIsNone(body['saved'])

    def test_place_without_google_data_has_nulls(self):
        body = self.client.get('/api/places/5/').json()
        for key in ('rating', 'rating_count', 'price_range', 'hours'):
            self.assertIsNone(body[key])

    def test_unknown_place_is_404(self):
        self.assertEqual(self.client.get('/api/places/9999/').status_code, 404)


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
