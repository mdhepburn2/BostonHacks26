import logging

from django.contrib.auth import authenticate, get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Case, Count, F, OuterRef, Prefetch, Q, Subquery, Value, When
from django.db.models.functions import Coalesce, Greatest, Lower
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
from .models import ActivityResponse, CircleMembership, Friendship, Place, PlaceInterest, Visibility
from .serializers import (ActivityResponseInputSerializer, ActivitySerializer, CircleMemberInputSerializer,
                          CircleSerializer, FeedItemSerializer, FriendRequestInputSerializer, FriendRequestSerializer,
                          IdentifyInputSerializer, LoginSerializer, PlaceInterestInputSerializer,
                          RegisterSerializer, SavedPlaceSerializer, SearchInputSerializer, TagSerializer,
                          UserSearchResultSerializer, UserSerializer, UserShortSerializer)
from .services.google_places import PRICE_RANGES
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

PRICE_LEVELS_BY_RANGE = {}
for _level, _range in PRICE_RANGES.items():
    PRICE_LEVELS_BY_RANGE.setdefault(_range, []).append(_level)

SAVED_SORTS = {
    'saved': ['-created_at', '-id'],                                     # newest saved first (default)
    'visited': [F('visited_at').desc(nulls_last=True), '-created_at', '-id'],  # most recent visit first
    'name': [Lower('place__name'), 'id'],                                # A to Z
}


def _saved_list(saved, params):
    """Shared by my saved places and someone else's.

    Filters: ?visited=true|false, ?tag=<id>, ?q=<name>, ?visibility=<value>,
    ?price_range=$,$$ (any of), ?type=<google type>. Sort: ?sort=saved|visited|name.
    Unknown or blank values are ignored.
    """
    visited = params.get('visited')
    if visited in ('true', 'false'):
        saved = saved.filter(visited=visited == 'true')
    tag = params.get('tag')
    if tag is not None and tag.isdigit():
        saved = saved.filter(tags=tag)
    q = ' '.join(params.get('q', '').split())
    if q:
        saved = saved.filter(place__name__icontains=q)
    visibility = params.get('visibility')
    if visibility in Visibility.values:
        saved = saved.filter(visibility=visibility)
    ranges = [r for r in params.get('price_range', '').split(',') if r in PRICE_LEVELS_BY_RANGE]
    if ranges:
        saved = saved.filter(place__price_level__in=[lvl for r in ranges for lvl in PRICE_LEVELS_BY_RANGE[r]])
    place_type = params.get('type', '').strip().lower()
    if place_type.replace('_', '').isalnum():
        # Matches the quoted type inside the stored JSON list; works on SQLite and Postgres.
        saved = saved.filter(place__types__icontains=f'"{place_type}"')
    saved = saved.order_by(*SAVED_SORTS.get(params.get('sort'), SAVED_SORTS['saved']))
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
    with transaction.atomic():
        # Clear every row between the pair so either of them can send a fresh request later.
        permissions.friendships_between(request.user, user_id).delete()
        permissions.drop_from_each_others_circles(request.user, user_id)
    return Response(status=status.HTTP_204_NO_CONTENT)


# --- Other users' saved places (Phase 3) ----------------------------------

@api_view(['GET'])
def user_saved_places(request, user_id):
    """Their saved places that I'm allowed to see."""
    owner = get_user_model().objects.filter(pk=user_id).first()
    if owner is None:
        return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
    return _saved_list(permissions.visible_saved_places(request.user).filter(user=owner), request.query_params)


USER_SEARCH_LIMIT = 20


@api_view(['GET'])
def user_search(request):
    """Find people by username (?q=, ignores case). Names starting with q come first. Never includes me."""
    q = request.query_params.get('q', '').strip()
    if not q:
        return Response({'results': []})
    users = list(
        get_user_model().objects.filter(username__icontains=q).exclude(pk=request.user.pk)
        .annotate(starts=Case(When(username__istartswith=q, then=Value(0)), default=Value(1)))
        .order_by('starts', Lower('username'))[:USER_SEARCH_LIMIT]
    )
    statuses = permissions.friendship_statuses(request.user, [u.pk for u in users])
    for u in users:
        u.friendship = statuses[u.pk]
    return Response({'results': UserSearchResultSerializer(users, many=True).data})


@api_view(['GET'])
def user_profile(request, user_id):
    """Someone's profile (or mine) as I'm allowed to see it, with counts."""
    user = get_user_model().objects.filter(pk=user_id).first()
    if user is None:
        return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
    # Saved and visited only count what I could see in their list, so private saves stay private.
    visible = permissions.visible_saved_places(request.user).filter(user=user)
    counts = visible.aggregate(saved=Count('id'), visited=Count('id', filter=Q(visited=True)))
    return Response({
        'id': user.pk,
        'username': user.username,
        'friendship': permissions.friendship_statuses(request.user, [user.pk])[user.pk],
        'counts': {
            'friends': permissions.friends_of(user).count(),
            'saved': counts['saved'],
            'visited': counts['visited'],
        },
    })


FEED_DEFAULT_LIMIT = 50
FEED_MAX_LIMIT = 100


@api_view(['GET'])
def feed(request):
    """Home friends feed: friends' saved places I can see, newest save or visit first.

    ?limit= (default 50, max 100).
    """
    limit = request.query_params.get('limit', '')
    limit = min(int(limit), FEED_MAX_LIMIT) if limit.isdigit() and int(limit) > 0 else FEED_DEFAULT_LIMIT
    items = permissions.friends_feed(request.user).annotate(
        feed_at=Greatest('created_at', Coalesce('marked_visited_at', 'created_at')),
    ).select_related('user', 'place').prefetch_related('tags').order_by('-feed_at', '-id')[:limit]
    return Response({'results': FeedItemSerializer(items, many=True).data})


# --- Place interest (Phase 3) ---------------------------------------------

@api_view(['POST', 'DELETE'])
def place_interest(request, place_id):
    """Mark / unmark interest in a place. Returns the live state for the card's button and count."""
    place = Place.objects.filter(pk=place_id).first()
    if place is None:
        return Response({'detail': 'Place not found.'}, status=status.HTTP_404_NOT_FOUND)
    mine = permissions.own_interests(request.user)

    if request.method == 'DELETE':
        mine.filter(place=place).delete()  # unmarking twice is fine
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = PlaceInterestInputSerializer(data=request.data, context={'request': request, 'place': place})
    data.is_valid(raise_exception=True)
    # Marking a place you're already interested in keeps the existing interest unchanged.
    interest = mine.filter(place=place).first()
    status_code = status.HTTP_200_OK
    if interest is None:
        try:
            with transaction.atomic():
                interest = PlaceInterest.objects.create(user=request.user, place=place,
                                                        via_saved_place=data.validated_data.get('via_saved_place_id'))
            status_code = status.HTTP_201_CREATED
        except IntegrityError:  # a double tap created it in between
            interest = mine.get(place=place)
    return Response({
        'interested': True,
        'via_saved_place_id': interest.via_saved_place_id,
        'friends_interested': permissions.friends_interested_count(request.user, place),
    }, status=status_code)


# --- Circles (Phase 3) ----------------------------------------------------

def _my_circles(user):
    return permissions.circles_for(user).select_related('owner') \
        .prefetch_related('memberships__user').order_by('name', 'id')


def _circle_response(user, circle_id, status_code=status.HTTP_200_OK):
    return Response(CircleSerializer(_my_circles(user).get(pk=circle_id)).data, status=status_code)


def _circle_not_found():
    return Response({'detail': 'Circle not found.'}, status=status.HTTP_404_NOT_FOUND)


def _owner_only():
    return Response({'detail': 'Only the circle owner can do that.'}, status=status.HTTP_403_FORBIDDEN)


@api_view(['GET', 'POST'])
def circles(request):
    """Circles I belong to (including ones I own), A to Z / create one."""
    if request.method == 'GET':
        return Response({'results': CircleSerializer(_my_circles(request.user), many=True).data})

    data = CircleSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    with transaction.atomic():
        circle = data.save(owner=request.user)
        CircleMembership.objects.create(circle=circle, user=request.user, role=CircleMembership.ROLE_OWNER)
    return _circle_response(request.user, circle.pk, status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
def circle_detail(request, circle_id):
    # Members can see it; anyone else gets 404 so circles can't be found by guessing ids.
    circle = _my_circles(request.user).filter(pk=circle_id).first()
    if circle is None:
        return _circle_not_found()
    if request.method == 'GET':
        return Response(CircleSerializer(circle).data)
    if not permissions.is_circle_owner(request.user, circle):
        return _owner_only()
    if request.method == 'DELETE':
        circle.delete()  # things shared with it become owner-only
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = CircleSerializer(circle, data=request.data, partial=True)
    data.is_valid(raise_exception=True)
    data.save()
    return _circle_response(request.user, circle.pk)


@api_view(['POST'])
def circle_members(request, circle_id):
    """Add one of my friends to a circle I own. Adding someone already in it returns 200."""
    circle = permissions.circle_for_sharing(request.user, circle_id)
    if circle is None:
        return _circle_not_found()
    if not permissions.is_circle_owner(request.user, circle):
        return _owner_only()

    data = CircleMemberInputSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    user_id = data.validated_data['user_id']
    if circle.memberships.filter(user_id=user_id).exists():
        return _circle_response(request.user, circle.pk)
    if not permissions.are_friends(request.user, user_id):
        return Response({'user_id': ['You can only add friends to a circle.']},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        with transaction.atomic():
            CircleMembership.objects.create(circle=circle, user_id=user_id)
    except IntegrityError:  # a double tap added them in between
        return _circle_response(request.user, circle.pk)
    return _circle_response(request.user, circle.pk, status.HTTP_201_CREATED)


@api_view(['DELETE'])
def circle_member_detail(request, circle_id, user_id):
    """Owner removes a member, or a member leaves. The owner can't leave (delete the circle instead)."""
    circle = permissions.circle_for_sharing(request.user, circle_id)
    if circle is None:
        return _circle_not_found()
    membership = circle.memberships.filter(user_id=user_id).first()
    if membership is None:
        return Response({'detail': "That user isn't in this circle."}, status=status.HTTP_404_NOT_FOUND)
    if not permissions.can_remove_member(request.user, circle, user_id):
        if permissions.is_circle_owner(request.user, circle):
            return Response({'detail': "The owner can't leave their circle. Delete it instead."},
                            status=status.HTTP_400_BAD_REQUEST)
        return _owner_only()
    membership.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# --- Activities (Phase 3) -------------------------------------------------

def _activities(user):
    """Activities the user can see, with reply counts, who replied, and their own reply attached.

    Anyone who can see an activity sees everyone's replies (going first, then interested, each
    in the order they replied), the same people the counts already count.
    """
    mine = permissions.own_responses(user).filter(activity=OuterRef('pk')).values('status')[:1]
    replies = ActivityResponse.objects.select_related('user').order_by('status', 'created_at', 'id')
    return permissions.visible_activities(user).select_related('author', 'place').prefetch_related(
        Prefetch('responses', queryset=replies, to_attr='reply_list'),
    ).annotate(
        interested_count=Count('responses', filter=Q(responses__status=ActivityResponse.STATUS_INTERESTED)),
        going_count=Count('responses', filter=Q(responses__status=ActivityResponse.STATUS_GOING)),
        my_response=Subquery(mine),
    )


def _activity_response(user, activity_id, status_code=status.HTTP_200_OK):
    return Response(ActivitySerializer(_activities(user).get(pk=activity_id)).data, status=status_code)


def _activity_not_found():
    return Response({'detail': 'Activity not found.'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET', 'POST'])
def activities(request):
    """The feed: upcoming activities soonest first, then past ones most recent first."""
    if request.method == 'GET':
        now = timezone.now()
        feed = _activities(request.user).annotate(
            is_past=Case(When(starts_at__lt=now, then=Value(1)), default=Value(0)),
            upcoming_at=Case(When(starts_at__gte=now, then=F('starts_at')), default=None),
        ).order_by('is_past', F('upcoming_at').asc(nulls_last=True), '-starts_at', 'id')
        return Response({'results': ActivitySerializer(feed, many=True).data})

    data = ActivitySerializer(data=request.data, context={'request': request})
    data.is_valid(raise_exception=True)
    activity = data.save(author=request.user)
    return _activity_response(request.user, activity.pk, status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
def activity_detail(request, activity_id):
    # Anyone who can see it can view it; anyone else gets 404 so ids can't be guessed.
    activity = _activities(request.user).filter(pk=activity_id).first()
    if activity is None:
        return _activity_not_found()
    if request.method == 'GET':
        return Response(ActivitySerializer(activity).data)
    if not permissions.is_activity_author(request.user, activity):
        return Response({'detail': 'Only the person who posted this can do that.'},
                        status=status.HTTP_403_FORBIDDEN)
    if request.method == 'DELETE':
        activity.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = ActivitySerializer(activity, data=request.data, partial=True, context={'request': request})
    data.is_valid(raise_exception=True)
    data.save()
    return _activity_response(request.user, activity.pk)


@api_view(['POST', 'DELETE'])
def respond_to_activity(request, activity_id):
    """Reply interested / going (replying again changes it), or remove my reply."""
    activity = permissions.visible_activities(request.user).filter(pk=activity_id).first()
    if activity is None:
        return _activity_not_found()
    mine = permissions.own_responses(request.user).filter(activity=activity)

    if request.method == 'DELETE':
        mine.delete()  # removing a reply that isn't there is fine
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = ActivityResponseInputSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    try:
        with transaction.atomic():
            _, created = ActivityResponse.objects.update_or_create(
                activity=activity, user=request.user, defaults={'status': data.validated_data['status']})
    except IntegrityError:  # a double tap created it in between
        mine.update(status=data.validated_data['status'], updated_at=timezone.now())
        created = False
    return _activity_response(request.user, activity.pk,
                              status.HTTP_201_CREATED if created else status.HTTP_200_OK)
