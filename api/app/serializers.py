from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from . import permissions
from .services.google_places import price_range
from .models import Activity, ActivityResponse, Circle, CircleMembership, Friendship, Place, SavedPlace, Tag, Visibility

User = get_user_model()

MAX_IMAGE_MB = 15
MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024


class IdentifyInputSerializer(serializers.Serializer):
    """Multipart body for POST /api/identify/."""

    image = serializers.ImageField()
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
    heading = serializers.FloatField(min_value=0, max_value=360, required=False, allow_null=True)
    # GPS horizontal accuracy in meters, as the phone reports it.
    accuracy = serializers.FloatField(min_value=0, required=False, allow_null=True)

    def validate_image(self, image):
        if image.size > MAX_IMAGE_BYTES:
            raise serializers.ValidationError(
                f'Image is too large ({image.size // (1024 * 1024)} MB). The limit is {MAX_IMAGE_MB} MB.')
        return image


class SearchInputSerializer(serializers.Serializer):
    """Query params for GET /api/places/search/."""

    q = serializers.CharField(max_length=200, trim_whitespace=True)
    lat = serializers.FloatField(min_value=-90, max_value=90, required=False)
    lng = serializers.FloatField(min_value=-180, max_value=180, required=False)

    def validate(self, attrs):
        if ('lat' in attrs) != ('lng' in attrs):
            raise serializers.ValidationError('Send both lat and lng, or neither.')
        return attrs


# --- Accounts (Phase 2) ---------------------------------------------------

class UserSerializer(serializers.ModelSerializer):
    """GET /api/me/, and the `user` in register/login responses."""

    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class RegisterSerializer(serializers.Serializer):
    """Body for POST /api/auth/register/."""

    username = serializers.RegexField(
        r'^[\w.@+-]+$', max_length=150,
        error_messages={'invalid': 'Usernames can only use letters, numbers and @ . + - _'},
    )
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    email = serializers.EmailField(required=False, allow_blank=True, default='')

    def validate_username(self, username):
        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError('That username is taken.')
        return username

    def validate(self, attrs):
        # Run Django's password checks (length, too common, too similar to the username).
        validate_password(attrs['password'], User(username=attrs['username'], email=attrs['email']))
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(serializers.Serializer):
    """Body for POST /api/auth/login/."""

    username = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)


# --- Saved places and tags (Phase 2) --------------------------------------

class PlaceShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Place
        fields = ['id', 'name', 'lat', 'lng']


class SavedPlacePlaceSerializer(PlaceShortSerializer):
    """The place inside a saved place: enough to filter the Saved tab by price and type."""

    price_range = serializers.SerializerMethodField()

    class Meta(PlaceShortSerializer.Meta):
        fields = PlaceShortSerializer.Meta.fields + ['price_range', 'types']

    def get_price_range(self, place):
        return price_range(place.price_level)


def resolve_visibility(attrs, instance, user):
    """Check visibility + circle_id together and turn circle_id into `circle`.

    A circle is required when visibility is "circle" (and must be one the user
    belongs to), and is cleared for every other visibility. Edits that don't
    touch either field leave them alone.
    """
    if 'visibility' not in attrs and 'circle_id' not in attrs:
        return attrs
    visibility = attrs.get('visibility', instance.visibility if instance else Visibility.PRIVATE)
    if 'circle_id' in attrs:
        circle_id = attrs.pop('circle_id')
        circle = permissions.circle_for_sharing(user, circle_id) if circle_id is not None else None
        if circle_id is not None and circle is None:
            raise serializers.ValidationError({'circle_id': 'Circle not found.'})
    else:
        circle = instance.circle if instance else None

    if visibility == Visibility.CIRCLE and circle is None:
        raise serializers.ValidationError({'circle_id': 'Pick a circle to share with.'})
    if visibility != Visibility.CIRCLE:
        circle = None
    attrs['circle'] = circle
    return attrs


class TagShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name']


class TagSerializer(serializers.ModelSerializer):
    """Tag shape, and the body for POST /api/tags/ and PATCH /api/tags/<id>/."""

    name = serializers.CharField(max_length=50, trim_whitespace=True)
    count = serializers.SerializerMethodField()

    class Meta:
        model = Tag
        fields = ['id', 'name', 'count']
        read_only_fields = ['id']

    def get_count(self, obj):
        """How many of the owner's saved places have this tag (annotated by the view)."""
        return getattr(obj, 'count', 0)

    def validate_name(self, name):
        name = ' '.join(name.split())
        clash = permissions.own_tags(self.context['request'].user).filter(name__iexact=name)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('You already have a tag with that name.')
        return name


class SavedPlaceSerializer(serializers.ModelSerializer):
    """Saved place shape, and the body for POST /api/saved/ and PATCH /api/saved/<id>/."""

    place = SavedPlacePlaceSerializer(read_only=True)
    place_id = serializers.PrimaryKeyRelatedField(
        queryset=Place.objects.all(), source='place', write_only=True,
        error_messages={'does_not_exist': 'Place not found.', 'incorrect_type': 'place_id must be a number.'},
    )
    circle_id = serializers.IntegerField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    tags = TagShortSerializer(many=True, read_only=True)
    # Replaces the whole set of tags. Each one must be the user's own.
    tag_ids = serializers.ListField(child=serializers.IntegerField(), required=False, write_only=True)

    class Meta:
        model = SavedPlace
        fields = ['id', 'place', 'place_id', 'visited', 'visited_at', 'note', 'visibility', 'circle_id', 'tags',
                  'tag_ids', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_visited_at(self, value):
        if value is not None and value > timezone.localdate():
            raise serializers.ValidationError("The visit date can't be in the future.")
        return value

    def validate(self, attrs):
        if self.instance is not None and 'place' in attrs:
            raise serializers.ValidationError({'place_id': "A saved place's place can't be changed."})
        self._resolve_visited(attrs)
        self._resolve_tags(attrs)
        return resolve_visibility(attrs, self.instance, self.context['request'].user)

    def _resolve_tags(self, attrs):
        if 'tag_ids' not in attrs:
            return
        ids = set(attrs.pop('tag_ids'))
        tags = list(permissions.own_tags(self.context['request'].user).filter(pk__in=ids))
        if len(tags) != len(ids):
            raise serializers.ValidationError({'tag_ids': 'Tag not found.'})
        attrs['tags'] = tags  # ModelSerializer sets many-to-many fields after saving

    def _resolve_visited(self, attrs):
        """Keep visited and visited_at consistent.

        - sending a visited_at marks the place visited
        - visited with no date defaults to today
        - unvisiting clears the date
        """
        sent_visited = 'visited' in attrs
        sent_date = attrs.get('visited_at') is not None
        if sent_visited and not attrs['visited'] and sent_date:
            raise serializers.ValidationError({'visited_at': "Can't set a visit date on a place you haven't visited."})
        if sent_date and not sent_visited:
            attrs['visited'] = True

        visited = attrs.get('visited', self.instance.visited if self.instance else False)
        visited_at = attrs.get('visited_at', self.instance.visited_at if self.instance else None)
        if not visited:
            attrs['visited_at'] = None
            attrs['marked_visited_at'] = None
        else:
            if visited_at is None:
                attrs['visited_at'] = timezone.localdate()
            if self.instance is None or not self.instance.visited:
                attrs['marked_visited_at'] = timezone.now()  # just ticked: bump it in friends' feeds


# --- Friends (Phase 3) ----------------------------------------------------

class UserShortSerializer(serializers.ModelSerializer):
    """A user as other people see them (no email)."""

    class Meta:
        model = User
        fields = ['id', 'username']


class UserSearchResultSerializer(UserShortSerializer):
    """One result in GET /api/users/search/. The view sets `friendship` on each user."""

    friendship = serializers.CharField()

    class Meta(UserShortSerializer.Meta):
        fields = UserShortSerializer.Meta.fields + ['friendship']


class FeedItemSerializer(serializers.Serializer):
    """One item in GET /api/feed/: a friend's saved place. `feed_at` comes from the view's annotation."""

    friend = UserShortSerializer(source='user')
    saved = SavedPlaceSerializer(source='*')
    feed_at = serializers.DateTimeField()


class FriendRequestSerializer(serializers.ModelSerializer):
    """Friend request shape."""

    from_user = UserShortSerializer(read_only=True)
    to_user = UserShortSerializer(read_only=True)

    class Meta:
        model = Friendship
        fields = ['id', 'from_user', 'to_user', 'status', 'created_at']


class FriendRequestInputSerializer(serializers.Serializer):
    """Body for POST /api/friends/requests/."""

    username = serializers.CharField(max_length=150)


# --- Place interest (Phase 3) ---------------------------------------------

class PlaceInterestInputSerializer(serializers.Serializer):
    """Optional body for POST /api/places/<id>/interest/. Needs `place` in the context."""

    via_saved_place_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_via_saved_place_id(self, value):
        """Turn the id into the SavedPlace. It must be someone else's that the user can see."""
        if value is None:
            return None
        saved = permissions.saved_place_for_interest(self.context['request'].user, value)
        if saved is None:
            raise serializers.ValidationError('Saved place not found.')
        if saved.place_id != self.context['place'].pk:
            raise serializers.ValidationError('That saved place is for a different place.')
        return saved


# --- Circles (Phase 3) ----------------------------------------------------

class CircleMemberSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = CircleMembership
        fields = ['id', 'username', 'role', 'joined_at']


class CircleSerializer(serializers.ModelSerializer):
    """Circle shape, and the body for POST /api/circles/ and PATCH /api/circles/<id>/."""

    name = serializers.CharField(max_length=100, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    owner = UserShortSerializer(read_only=True)
    members = serializers.SerializerMethodField()

    class Meta:
        model = Circle
        fields = ['id', 'name', 'description', 'owner', 'members', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_members(self, obj):
        """Owner first, then everyone else in the order they joined."""
        memberships = sorted(obj.memberships.all(),
                             key=lambda m: (m.role != CircleMembership.ROLE_OWNER, m.joined_at, m.pk))
        return CircleMemberSerializer(memberships, many=True).data

    def validate_name(self, name):
        name = ' '.join(name.split())
        if not name:
            raise serializers.ValidationError('Give the circle a name.')
        return name


class CircleMemberInputSerializer(serializers.Serializer):
    """Body for POST /api/circles/<id>/members/."""

    user_id = serializers.IntegerField()


# --- Activities (Phase 3) -------------------------------------------------

class ActivitySerializer(serializers.ModelSerializer):
    """Activity shape, and the body for POST /api/activities/ and PATCH /api/activities/<id>/.

    `counts` and `my_response` come from annotations added by the view.
    """

    author = UserShortSerializer(read_only=True)
    place = PlaceShortSerializer(read_only=True)
    place_id = serializers.PrimaryKeyRelatedField(
        queryset=Place.objects.all(), source='place', write_only=True,
        error_messages={'does_not_exist': 'Place not found.', 'incorrect_type': 'place_id must be a number.'},
    )
    title = serializers.CharField(max_length=120, trim_whitespace=True)
    description = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    visibility = serializers.ChoiceField(
        choices=Activity.VISIBILITY_CHOICES, required=False,
        error_messages={'invalid_choice': 'Activities can be shared with friends, a circle or everyone.'},
    )
    circle_id = serializers.IntegerField(required=False, allow_null=True)
    counts = serializers.SerializerMethodField()
    my_response = serializers.SerializerMethodField()
    responses = serializers.SerializerMethodField()

    class Meta:
        model = Activity
        fields = ['id', 'author', 'place', 'place_id', 'title', 'description', 'starts_at', 'visibility',
                  'circle_id', 'counts', 'my_response', 'responses']
        read_only_fields = ['id']

    def get_counts(self, obj):
        return {'interested': getattr(obj, 'interested_count', 0), 'going': getattr(obj, 'going_count', 0)}

    def get_my_response(self, obj):
        return getattr(obj, 'my_response', None)

    def get_responses(self, obj):
        # `reply_list` is prefetched by the view: going first, then interested, oldest reply first.
        return [{'user': UserShortSerializer(r.user).data, 'status': r.status}
                for r in getattr(obj, 'reply_list', [])]

    def validate_title(self, title):
        title = ' '.join(title.split())
        if not title:
            raise serializers.ValidationError('Give the activity a title.')
        return title

    def validate_starts_at(self, value):
        if value < timezone.now():
            raise serializers.ValidationError("The start time can't be in the past.")
        return value

    def validate(self, attrs):
        if self.instance is None and 'visibility' not in attrs:
            attrs['visibility'] = Visibility.FRIENDS
        return resolve_visibility(attrs, self.instance, self.context['request'].user)


class ActivityResponseInputSerializer(serializers.Serializer):
    """Body for POST /api/activities/<id>/respond/."""

    status = serializers.ChoiceField(choices=ActivityResponse.STATUS_CHOICES)
