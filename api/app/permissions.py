"""Who can see and edit what. All visibility and ownership checks go through here.

Views never filter by owner or visibility inline: they ask for a queryset from
this module and 404 when the object isn't in it, so private objects can't be
discovered by guessing ids.

Phase 2 only has owner access (you can see and edit your own saved places and
lists). Phase 3 adds `visible_to(viewer)` helpers for friends' and circles' data.
"""

from .models import Circle, PlaceList, SavedPlace


def own_saved_places(user):
    """The user's saved places, which only they can edit."""
    return SavedPlace.objects.filter(user=user)


def own_lists(user):
    """The user's lists, which only they can edit."""
    return PlaceList.objects.filter(owner=user)


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
