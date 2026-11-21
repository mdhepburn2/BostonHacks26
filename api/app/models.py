from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


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


# --- Accounts, saving and tags (Phase 2) ----------------------------------

class Visibility(models.TextChoices):
    """Who can see a SavedPlace or Activity. Checks live in app/permissions.py."""

    PRIVATE = 'private', 'Only me'
    FRIENDS = 'friends', 'Friends'
    CIRCLE = 'circle', 'A circle'
    PUBLIC = 'public', 'Anyone logged in'


class Circle(models.Model):
    """A group of friends for making plans.

    Created here because saved places can be shared with a circle.
    The circle endpoints come in Phase 3; until then circles are made in the admin.
    """

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='owned_circles')
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, through='CircleMembership',
                                     related_name='circles', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class CircleMembership(models.Model):
    """The owner has a row too (role=owner), so membership is the one thing to check."""

    ROLE_OWNER = 'owner'
    ROLE_MEMBER = 'member'
    ROLE_CHOICES = [(ROLE_OWNER, 'Owner'), (ROLE_MEMBER, 'Member')]

    circle = models.ForeignKey(Circle, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='circle_memberships')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['circle', 'user'], name='unique_circle_member')]

    def __str__(self):
        return f'{self.user} in {self.circle}'


class Tag(models.Model):
    """A user's own label for their saved places, like "date ideas" or "coffee". Names are unique per user,
    ignoring case."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tags')
    name = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name', 'id']
        constraints = [models.UniqueConstraint(Lower('name'), 'owner', name='unique_tag_name_per_user')]

    def __str__(self):
        return self.name


class SavedPlace(models.Model):
    """A place a user saved. All of a user's saved places are their one list ("My saved locations").

    Each saved place has its own visibility. It's also the single source of truth for whether
    the user has visited the place.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='saved_places')
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='saves')
    visited = models.BooleanField(default=False)
    visited_at = models.DateField(null=True, blank=True)  # whenever the user says they went
    note = models.TextField(blank=True)
    visibility = models.CharField(max_length=10, choices=Visibility.choices, default=Visibility.PRIVATE)
    # Required when visibility is "circle". If the circle is deleted this becomes
    # null and only the owner can see it.
    circle = models.ForeignKey(Circle, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    tags = models.ManyToManyField(Tag, related_name='saved_places', blank=True)  # only the owner's own tags
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [models.UniqueConstraint(fields=['user', 'place'], name='unique_saved_place')]

    def __str__(self):
        return f'{self.user} saved {self.place}'


# --- Social (Phase 3) -----------------------------------------------------

class Friendship(models.Model):
    """A friend request from one user to another.

    Two users are friends when an accepted row exists in either direction.
    Friend checks go through app/permissions.py.
    """

    STATUS_PENDING = 'pending'
    STATUS_ACCEPTED = 'accepted'
    STATUS_DECLINED = 'declined'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_ACCEPTED, 'Accepted'),
        (STATUS_DECLINED, 'Declined'),
    ]

    from_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                  related_name='friend_requests_sent')
    to_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name='friend_requests_received')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [
            models.UniqueConstraint(fields=['from_user', 'to_user'], name='unique_friendship'),
            models.CheckConstraint(condition=~models.Q(from_user=models.F('to_user')), name='no_self_friendship'),
        ]

    def __str__(self):
        return f'{self.from_user} -> {self.to_user} ({self.status})'


class PlaceInterest(models.Model):
    """A user marking a place as somewhere they'd like to go.

    `via_saved_place` is set when they marked it from a friend's saved place (and
    only if they could see that saved place). Friends' interest is counted live on
    the place card; see app/permissions.py.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='place_interests')
    place = models.ForeignKey(Place, on_delete=models.CASCADE, related_name='interests')
    # If that saved place is unsaved later, the interest stays.
    via_saved_place = models.ForeignKey(SavedPlace, on_delete=models.SET_NULL, null=True, blank=True,
                                        related_name='interests')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [models.UniqueConstraint(fields=['user', 'place'], name='unique_place_interest')]

    def __str__(self):
        return f'{self.user} interested in {self.place}'
