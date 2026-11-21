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
