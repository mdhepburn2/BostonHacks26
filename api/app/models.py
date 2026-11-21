from django.db import models


class Place(models.Model):
    """A real-world place. Upsert by external_id; never create duplicates."""

    SOURCE_GOOGLE = 'google'
    SOURCE_WIKI = 'wiki'
    SOURCE_CHOICES = [
        (SOURCE_GOOGLE, 'Google Places'),
        (SOURCE_WIKI, 'Wikipedia'),
    ]

    # Basic data from Nearby/Text Search or Wikipedia geosearch
    external_id = models.CharField(max_length=255, unique=True)  # Google place_id or Wikipedia pageid
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES)
    name = models.CharField(max_length=255)
    address = models.CharField(max_length=500, blank=True)
    lat = models.FloatField()
    lng = models.FloatField()
    types = models.JSONField(default=list, blank=True)
    raw_data = models.JSONField(default=dict, blank=True)

    # Wikipedia
    wiki_title = models.CharField(max_length=255, blank=True)
    wiki_summary = models.TextField(blank=True)

    # Place Details (fetched only when a card is opened; refresh after 7 days)
    rating = models.FloatField(null=True, blank=True)
    rating_count = models.IntegerField(null=True, blank=True)
    price_level = models.CharField(max_length=40, null=True, blank=True)  # Google enum, e.g. PRICE_LEVEL_MODERATE
    opening_hours = models.JSONField(null=True, blank=True)  # list of weekday description strings
    details_fetched_at = models.DateTimeField(null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class NearbySearchCache(models.Model):
    """Candidates for a ~100m grid cell. grid_key is lat,lng rounded to 3 decimals."""

    grid_key = models.CharField(max_length=40, unique=True)  # e.g. "42.358,-71.057"
    places = models.ManyToManyField(Place, related_name='nearby_caches', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.grid_key


class TextSearchCache(models.Model):
    """Results for a normalized search query (lowercased, trimmed, collapsed spaces)."""

    query = models.CharField(max_length=255, unique=True)
    places = models.ManyToManyField(Place, related_name='text_caches', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.query


class PlaceCard(models.Model):
    """Cached LLM bio and nearest T stop for a place."""

    place = models.OneToOneField(Place, on_delete=models.CASCADE, related_name='card')
    bio = models.TextField(blank=True)
    nearest_t = models.JSONField(null=True, blank=True)  # {"stop": "", "lines": [""], "walk_min": 0}
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Card: {self.place.name}'
