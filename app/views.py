from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .serializers import IdentifyInputSerializer, SearchInputSerializer
from .services import mock


@api_view(['GET'])
@permission_classes([AllowAny])
def health(request):
    return Response({'status': 'ok'})


# Phase 1 place endpoints. These return mock data (app/services/mock.py) with the
# real response shapes so the frontend can build against them. Steps 8-10 swap
# the mock calls for the real services.

@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser])
def identify(request):
    data = IdentifyInputSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    return Response(mock.identify(data.validated_data['lat'], data.validated_data['lng']))


@api_view(['GET'])
@permission_classes([AllowAny])
def place_search(request):
    data = SearchInputSerializer(data=request.query_params)
    data.is_valid(raise_exception=True)
    return Response(mock.search(data.validated_data['q']))


@api_view(['GET'])
@permission_classes([AllowAny])
def place_detail(request, place_id):
    card = mock.place_card(place_id)
    if card is None:
        return Response({'detail': 'Place not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(card)
