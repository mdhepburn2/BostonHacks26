"""Who can see and edit what. All visibility and ownership checks go through here.

Views never filter by owner or visibility inline: they ask for a queryset from
this module and 404 when the object isn't in it, so private objects can't be
discovered by guessing ids.

Editing is always owner-only (`own_*`). Seeing someone else's things follows
their visibility (`visible_*`):

    private  only the owner
    friends  the owner + accepted friends
    circle   the owner + members of the chosen circle (no circle -> owner only)
    public   any logged-in user
"""

from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import Circle, Friendship, PlaceInterest, SavedPlace, Tag, Visibility


def own_saved_places(user):
    """The user's saved places, which only they can edit."""
    return SavedPlace.objects.filter(user=user)


def own_tags(user):
    """The user's tags. Only they can see, use or edit them."""
    return Tag.objects.filter(owner=user)


def saved_for_card(user, place):
    """The user's SavedPlace for `place`, or None (also None when not logged in)."""
    if user is None or not user.is_authenticated:
        return None
    return own_saved_places(user).filter(place=place).first()


def circles_for(user):
    """Circles the user belongs to (owners have a membership row too)."""
    return Circle.objects.filter(memberships__user=user)


def circle_for_sharing(user, circle_id):
    """The circle with this id if the user may share things with it, else None."""
    return circles_for(user).filter(pk=circle_id).first()


# --- Friends (Phase 3) ----------------------------------------------------

def friendships_between(a, b):
    """Every Friendship row between two users, in either direction."""
    return Friendship.objects.filter(Q(from_user=a, to_user=b) | Q(from_user=b, to_user=a))


def friend_ids(user):
    """Subquery of the ids of the user's accepted friends (either direction)."""
    accepted = Friendship.objects.filter(status=Friendship.STATUS_ACCEPTED)
    sent = accepted.filter(from_user=user).values('to_user')
    received = accepted.filter(to_user=user).values('from_user')
    return get_user_model().objects.filter(Q(pk__in=sent) | Q(pk__in=received)).values('pk')


def friends_of(user):
    """The user's accepted friends, A to Z."""
    return get_user_model().objects.filter(pk__in=friend_ids(user)).order_by('username')


def are_friends(a, b):
    return friendships_between(a, b).filter(status=Friendship.STATUS_ACCEPTED).exists()


def incoming_requests(user):
    """Pending friend requests sent to the user. Only they can accept or decline these."""
    return Friendship.objects.filter(to_user=user, status=Friendship.STATUS_PENDING)


# --- Visibility (Phase 3) -------------------------------------------------

def _visible_q(viewer, owner_field):
    """Q for rows whose visibility lets `viewer` see them. `owner_field` is the FK to the owner."""
    if viewer is None or not viewer.is_authenticated:
        return Q(pk__in=[])
    return (
        Q(**{owner_field: viewer})
        | Q(visibility=Visibility.PUBLIC)
        | Q(visibility=Visibility.FRIENDS, **{f'{owner_field}__in': friend_ids(viewer)})
        | Q(visibility=Visibility.CIRCLE, circle__in=circles_for(viewer).values('pk'))
    )


def visible_saved_places(viewer):
    """Every saved place `viewer` is allowed to see, going by each one's own visibility."""
    return SavedPlace.objects.filter(_visible_q(viewer, 'user'))


# --- Place interest (Phase 3) ---------------------------------------------

def own_interests(user):
    """The user's own place interests, which only they can add or remove."""
    return PlaceInterest.objects.filter(user=user)


def interested_for_card(user, place):
    """Whether the user has marked interest in `place` (False when not logged in)."""
    if user is None or not user.is_authenticated:
        return False
    return own_interests(user).filter(place=place).exists()


def friends_interested_count(user, place):
    """How many of the user's accepted friends are interested in `place`. 0 when not logged in.

    Checked live, so unfriending someone drops them from the count straight away.
    """
    if user is None or not user.is_authenticated:
        return 0
    return PlaceInterest.objects.filter(place=place, user__in=friend_ids(user)).count()


def saved_place_for_interest(user, saved_place_id):
    """Someone else's saved place that `user` can see and so may mark interest from, else None."""
    return visible_saved_places(user).exclude(user=user).filter(pk=saved_place_id).first()
