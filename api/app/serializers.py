from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from . import permissions
from .models import Place, PlaceList, SavedPlace, Visibility

User = get_user_model()

MAX_IMAGE_MB = 15
MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024


class IdentifyInputSerializer(serializers.Serializer):
    """Multipart body for POST /api/identify/."""

    image = serializers.ImageField()
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lng = serializers.FloatField(min_value=-180, max_value=180)
    heading = serializers.FloatField(min_value=0, max_value=360, required=False, allow_null=True)

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


# --- Saved places and lists (Phase 2) -------------------------------------

class PlaceShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = Place
        fields = ['id', 'name', 'lat', 'lng']


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


class SavedPlaceSerializer(serializers.ModelSerializer):
    """Saved place shape, and the body for POST /api/saved/ and PATCH /api/saved/<id>/."""

    place = PlaceShortSerializer(read_only=True)
    place_id = serializers.PrimaryKeyRelatedField(
        queryset=Place.objects.all(), source='place', write_only=True,
        error_messages={'does_not_exist': 'Place not found.', 'incorrect_type': 'place_id must be a number.'},
    )
    circle_id = serializers.IntegerField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000)

    class Meta:
        model = SavedPlace
        fields = ['id', 'place', 'place_id', 'visited', 'visited_at', 'note', 'visibility', 'circle_id', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_visited_at(self, value):
        if value is not None and value > timezone.localdate():
            raise serializers.ValidationError("The visit date can't be in the future.")
        return value

    def validate(self, attrs):
        if self.instance is not None and 'place' in attrs:
            raise serializers.ValidationError({'place_id': "A saved place's place can't be changed."})
        self._resolve_visited(attrs)
        return resolve_visibility(attrs, self.instance, self.context['request'].user)

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
        elif visited_at is None:
            attrs['visited_at'] = timezone.localdate()


class PlaceListSerializer(serializers.ModelSerializer):
    """List shape, and the body for POST /api/lists/ and PATCH /api/lists/<id>/."""

    circle_id = serializers.IntegerField(required=False, allow_null=True)
    items = SavedPlaceSerializer(many=True, read_only=True)
    visited_count = serializers.SerializerMethodField()
    total_count = serializers.SerializerMethodField()

    class Meta:
        model = PlaceList
        fields = ['id', 'name', 'description', 'visibility', 'circle_id', 'items', 'visited_count', 'total_count']
        read_only_fields = ['id']
        extra_kwargs = {'description': {'required': False, 'allow_blank': True, 'max_length': 2000}}

    # Both counts use the prefetched items, so they don't add queries.
    def get_visited_count(self, obj):
        return sum(1 for item in obj.items.all() if item.visited)

    def get_total_count(self, obj):
        return len(obj.items.all())

    def validate(self, attrs):
        return resolve_visibility(attrs, self.instance, self.context['request'].user)


class ListItemInputSerializer(serializers.Serializer):
    """Body for POST /api/lists/<id>/items/."""

    place_id = serializers.PrimaryKeyRelatedField(
        queryset=Place.objects.all(),
        error_messages={'does_not_exist': 'Place not found.', 'incorrect_type': 'place_id must be a number.'},
    )
