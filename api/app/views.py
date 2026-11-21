import logging

from django.contrib.auth import authenticate, get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Count
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from . import permissions
from .models import Friendship, Place
from .serializers import (FriendRequestInputSerializer, FriendRequestSerializer, IdentifyInputSerializer,
                          LoginSerializer, RegisterSerializer, SavedPlaceSerializer, SearchInputSerializer,
                          TagSerializer, UserSerializer, UserShortSerializer)
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

def _saved_list(saved, params):
    """Shared by my saved places and someone else's: ?visited=true|false and ?tag=<id> filters."""
    visited = params.get('visited')
    if visited in ('true', 'false'):
        saved = saved.filter(visited=visited == 'true')
    tag = params.get('tag')
    if tag is not None and tag.isdigit():
        saved = saved.filter(tags=tag)
    saved = saved.select_related('place').prefetch_related('tags')
    return Response({'results': SavedPlaceSerializer(saved, many=True).data})


@api_view(['GET', 'POST'])
def saved_places(request):
    """My saved locations: the user's one list of everything they've saved."""
    if request.method == 'GET':
        return _saved_list(permissions.own_saved_places(request.user), request.query_params)

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
    saved = permissions.own_saved_places(request.user).select_related('place').prefetch_related('tags') \
        .filter(pk=saved_id).first()
    if saved is None:
        return Response({'detail': 'Saved place not found.'}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        saved.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = SavedPlaceSerializer(saved, data=request.data, partial=True, context={'request': request})
    data.is_valid(raise_exception=True)
    return Response(SavedPlaceSerializer(data.save()).data)


# --- Tags (Phase 2) -------------------------------------------------------

def _own_tags(user):
    return permissions.own_tags(user).annotate(count=Count('saved_places'))


@api_view(['GET', 'POST'])
def tags(request):
    if request.method == 'GET':
        return Response({'results': TagSerializer(_own_tags(request.user), many=True).data})

    # Creating a tag that already exists (ignoring case) returns the existing one.
    name = request.data.get('name')
    if isinstance(name, str):
        existing = _own_tags(request.user).filter(name__iexact=' '.join(name.split())).first()
        if existing is not None:
            return Response(TagSerializer(existing).data)
    data = TagSerializer(data=request.data, context={'request': request})
    data.is_valid(raise_exception=True)
    try:
        with transaction.atomic():
            tag = data.save(owner=request.user)
    except IntegrityError:  # a double tap created it in between
        return Response(TagSerializer(_own_tags(request.user).get(name__iexact=data.validated_data['name'])).data)
    return Response(TagSerializer(_own_tags(request.user).get(pk=tag.pk)).data, status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
def tag_detail(request, tag_id):
    tag = _own_tags(request.user).filter(pk=tag_id).first()
    if tag is None:
        return Response({'detail': 'Tag not found.'}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        tag.delete()  # the places it was on stay saved
        return Response(status=status.HTTP_204_NO_CONTENT)
    data = TagSerializer(tag, data=request.data, partial=True, context={'request': request})
    data.is_valid(raise_exception=True)
    data.save()
    return Response(TagSerializer(_own_tags(request.user).get(pk=tag_id)).data)


# --- Friends (Phase 3) ----------------------------------------------------

def _request_response(friendship, status_code=status.HTTP_200_OK):
    friendship = Friendship.objects.select_related('from_user', 'to_user').get(pk=friendship.pk)
    return Response(FriendRequestSerializer(friendship).data, status=status_code)


def _accept(friendship):
    """Accept a request and drop any other rows between the pair, so friends share one row."""
    with transaction.atomic():
        friendship.status = Friendship.STATUS_ACCEPTED
        friendship.save(update_fields=['status'])
        permissions.friendships_between(friendship.from_user_id, friendship.to_user_id) \
            .exclude(pk=friendship.pk).delete()


@api_view(['GET'])
def friends(request):
    return Response({'results': UserShortSerializer(permissions.friends_of(request.user), many=True).data})


@api_view(['GET', 'POST'])
def friend_requests(request):
    if request.method == 'GET':
        incoming = permissions.incoming_requests(request.user).select_related('from_user', 'to_user')
        return Response({'results': FriendRequestSerializer(incoming, many=True).data})

    data = FriendRequestInputSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    me = request.user
    target = get_user_model().objects.filter(username__iexact=data.validated_data['username']).first()
    if target is None:
        return Response({'detail': 'No one has that username.'}, status=status.HTTP_404_NOT_FOUND)
    if target.pk == me.pk:
        return Response({'detail': "You can't send a friend request to yourself."},
                        status=status.HTTP_400_BAD_REQUEST)

    rows = list(permissions.friendships_between(me, target))
    if any(r.status == Friendship.STATUS_ACCEPTED for r in rows):
        return Response({'detail': "You're already friends."}, status=status.HTTP_400_BAD_REQUEST)

    theirs = next((r for r in rows if r.from_user_id == target.pk and r.status == Friendship.STATUS_PENDING), None)
    if theirs is not None:  # they already asked me, so asking back means yes
        _accept(theirs)
        return _request_response(theirs)

    mine = next((r for r in rows if r.from_user_id == me.pk), None)
    if mine is not None and mine.status == Friendship.STATUS_PENDING:
        return _request_response(mine)
    if mine is not None:  # declined before; sending again puts it back in their requests
        mine.status = Friendship.STATUS_PENDING
        mine.created_at = timezone.now()
        mine.save(update_fields=['status', 'created_at'])
        return _request_response(mine, status.HTTP_201_CREATED)

    try:
        with transaction.atomic():
            mine = Friendship.objects.create(from_user=me, to_user=target)
    except IntegrityError:  # a double tap created it in between
        return _request_response(Friendship.objects.get(from_user=me, to_user=target))
    return _request_response(mine, status.HTTP_201_CREATED)


def _incoming_request(request, request_id):
    return permissions.incoming_requests(request.user).filter(pk=request_id).first()


def _request_not_found():
    return Response({'detail': 'Friend request not found.'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['POST'])
def accept_friend_request(request, request_id):
    friendship = _incoming_request(request, request_id)
    if friendship is None:
        return _request_not_found()
    _accept(friendship)
    return _request_response(friendship)


@api_view(['POST'])
def decline_friend_request(request, request_id):
    friendship = _incoming_request(request, request_id)
    if friendship is None:
        return _request_not_found()
    friendship.status = Friendship.STATUS_DECLINED
    friendship.save(update_fields=['status'])
    return _request_response(friendship)


@api_view(['DELETE'])
def unfriend(request, user_id):
    if not permissions.are_friends(request.user, user_id):
        return Response({'detail': "You aren't friends with that user."}, status=status.HTTP_404_NOT_FOUND)
    # Clear every row between the pair so either of them can send a fresh request later.
    permissions.friendships_between(request.user, user_id).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# --- Other users' saved places (Phase 3) ----------------------------------

@api_view(['GET'])
def user_saved_places(request, user_id):
    """Their saved places that I'm allowed to see."""
    owner = get_user_model().objects.filter(pk=user_id).first()
    if owner is None:
        return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
    return _saved_list(permissions.visible_saved_places(request.user).filter(user=owner), request.query_params)
