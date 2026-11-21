from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Place
from .serializers import IdentifyInputSerializer, SearchInputSerializer
from .services.http import ExternalAPIError
from .services.identify import identify as identify_photo
from .services.place_card import get_card
from .services.search import search_places


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    return Response({'status': 'ok'})


@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser])
def identify(request):
    data = IdentifyInputSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    v = data.validated_data
    return Response(identify_photo(v['image'], v['lat'], v['lng'], v.get('heading')))


@api_view(['GET'])
@permission_classes([AllowAny])
def place_search(request):
    data = SearchInputSerializer(data=request.query_params)
    data.is_valid(raise_exception=True)
    v = data.validated_data
    try:
        places = search_places(v['q'], v.get('lat'), v.get('lng'))
    except ExternalAPIError:
        return Response(
            {'detail': "Search isn't available right now. Please try again in a moment."},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    return Response({'results': [
        {'id': p.id, 'name': p.name, 'address': p.address, 'lat': p.lat, 'lng': p.lng}
        for p in places
    ]})


@api_view(['GET'])
@permission_classes([AllowAny])
def place_detail(request, place_id):
    place = Place.objects.filter(pk=place_id).first()
    if place is None:
        return Response({'detail': 'Place not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(get_card(place))
