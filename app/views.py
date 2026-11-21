import logging

from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from .models import Place
from .serializers import IdentifyInputSerializer, SearchInputSerializer
from .services.http import ExternalAPIError
from .services.identify import identify as identify_photo
from .services.place_card import get_card
from .services.search import search_places

logger = logging.getLogger(__name__)


def exception_handler(exc, context):
    """DRF's handler, plus a JSON 500 for anything it doesn't know about.

    Services are written to never raise for upstream failures, so reaching the
    fallback here means a bug. Log it with a traceback and keep the response
    shape the app expects ({"detail": ...}) instead of Django's HTML error page.
    """
    response = drf_exception_handler(exc, context)
    if response is None:
        view = context.get('view')
        logger.exception('unhandled error in %s', view.__class__.__name__ if view else 'view')
        response = Response({'detail': 'Something went wrong. Please try again.'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    return response


def not_found(request, exception=None):
    """JSON 404 for URLs that don't match any route (used when DEBUG is off)."""
    return JsonResponse({'detail': 'Not found.'}, status=404)


def server_error(request):
    """JSON 500 for errors outside DRF views (used when DEBUG is off)."""
    return JsonResponse({'detail': 'Something went wrong. Please try again.'}, status=500)


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
