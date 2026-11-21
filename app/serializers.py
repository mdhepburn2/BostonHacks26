from rest_framework import serializers

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
