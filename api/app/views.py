import logging

from django.contrib.auth import authenticate, get_user_model
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from . import permissions
from .models import Place, SavedPlace
from .serializers import (IdentifyInputSerializer, ListItemInputSerializer, LoginSerializer,
                          PlaceListSerializer, RegisterSerializer, SavedPlaceSerializer,
                          SearchInputSerializer, UserSerializer)
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
    return Response(get_card(place, request.user))


# --- Accounts (Phase 2) ---------------------------------------------------

def _auth_response(user, status_code=status.HTTP_200_OK):
    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': UserSerializer(user).data}, status=status_code)


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    data = RegisterSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    try:
        with transaction.atomic():
            user = data.save()
    except IntegrityError:  # someone took the username between the check and the insert
        return Response({'username': ['That username is taken.']}, status=status.HTTP_400_BAD_REQUEST)
    return _auth_response(user, status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    data = LoginSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    v = data.validated_data
    # Usernames are unique ignoring case (see RegisterSerializer), so "Matt" can log in as "matt".
    match = get_user_model().objects.filter(username__iexact=v['username']).first()
    user = authenticate(request, username=match.username if match else v['username'], password=v['password'])
    if user is None:
        return Response({'detail': 'Wrong username or password.'}, status=status.HTTP_400_BAD_REQUEST)
    return _auth_response(user)


@api_view(['GET'])
def me(request):
    return Response(UserSerializer(request.user).data)


# --- Saved places (Phase 2) -----------------------------------------------

@api_view(['GET', 'POST'])
def saved_places(request):
    if request.method == 'GET':
        saved = permissions.own_saved_places(request.user).select_related('place')
        visited = request.query_params.get('visited')
        if visited in ('true', 'false'):
            saved = saved.filter(visited=visited == 'true')
        return Response({'results': SavedPlaceSerializer(saved, many=True).data})

    data = SavedPlaceSerializer(data=request.data, context={'request': request})
    data.is_valid(raise_exception=True)
    # Saving a place that's already saved returns the existing one unchanged (use PATCH to edit it).
    existing = permissions.own_saved_places(request.user).filter(place=data.validated_data['place']).first()
    if existing is None:
        try:
            with transaction.atomic():
                return Response(SavedPlaceSerializer(data.save(user=request.user)).data,
                                status=status.HTTP_201_CREATED)
        except IntegrityError:  # a double tap saved it in between
            existing = permissions.own_saved_places(request.user).get(place=data.validated_data['place'])
    return Response(SavedPlaceSerializer(existing).data)


@api_view(['PATCH', 'DELETE'])
def saved_place_detail(request, saved_id):
    saved = permissions.own_saved_places(request.user).select_related('place').filter(pk=saved_id).first()
    if saved is None:
        return Response({'detail': 'Saved place not found.'}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        saved.delete()  # also removes it from the user's lists
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = SavedPlaceSerializer(saved, data=request.data, partial=True, context={'request': request})
    data.is_valid(raise_exception=True)
    return Response(SavedPlaceSerializer(data.save()).data)


# --- Lists (Phase 2) ------------------------------------------------------

def _own_list(request, list_id):
    return permissions.own_lists(request.user).prefetch_related('items__place').filter(pk=list_id).first()


def _list_not_found():
    return Response({'detail': 'List not found.'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET', 'POST'])
def place_lists(request):
    if request.method == 'GET':
        lists = permissions.own_lists(request.user).prefetch_related('items__place')
        return Response({'results': PlaceListSerializer(lists, many=True).data})

    data = PlaceListSerializer(data=request.data, context={'request': request})
    data.is_valid(raise_exception=True)
    return Response(PlaceListSerializer(data.save(owner=request.user)).data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
def place_list_detail(request, list_id):
    place_list = _own_list(request, list_id)
    if place_list is None:
        return _list_not_found()
    if request.method == 'GET':
        return Response(PlaceListSerializer(place_list).data)
    if request.method == 'DELETE':
        place_list.delete()  # the saved places themselves stay saved
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = PlaceListSerializer(place_list, data=request.data, partial=True, context={'request': request})
    data.is_valid(raise_exception=True)
    data.save()
    return Response(PlaceListSerializer(_own_list(request, list_id)).data)


@api_view(['POST'])
def place_list_items(request, list_id):
    """Add a place to a list, saving it first if the user hasn't yet."""
    place_list = _own_list(request, list_id)
    if place_list is None:
        return _list_not_found()
    data = ListItemInputSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    place = data.validated_data['place_id']

    try:
        with transaction.atomic():
            saved, _ = SavedPlace.objects.get_or_create(user=request.user, place=place)
    except IntegrityError:  # created by a concurrent request
        saved = permissions.own_saved_places(request.user).get(place=place)

    already_in = place_list.items.filter(pk=saved.pk).exists()
    if not already_in:
        place_list.items.add(saved)
        place_list.save(update_fields=['updated_at'])
    return Response(PlaceListSerializer(_own_list(request, list_id)).data,
                    status=status.HTTP_200_OK if already_in else status.HTTP_201_CREATED)


@api_view(['DELETE'])
def place_list_item_detail(request, list_id, saved_id):
    """Remove a place from a list. It stays in the user's saved places."""
    place_list = _own_list(request, list_id)
    if place_list is None:
        return _list_not_found()
    saved = place_list.items.filter(pk=saved_id).first()
    if saved is None:
        return Response({'detail': "That place isn't in this list."}, status=status.HTTP_404_NOT_FOUND)
    place_list.items.remove(saved)
    place_list.save(update_fields=['updated_at'])
    return Response(status=status.HTTP_204_NO_CONTENT)
