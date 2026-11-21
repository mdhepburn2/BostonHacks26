from django.contrib import admin

from .models import (Circle, CircleMembership, Friendship, NearbySearchCache, Place, PlaceCard, PlaceList, SavedPlace,
                     TextSearchCache)


@admin.register(Place)
class PlaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'source', 'lat', 'lng', 'rating', 'details_fetched_at', 'updated_at')
    list_filter = ('source',)
    search_fields = ('name', 'address', 'external_id', 'wiki_title')


@admin.register(NearbySearchCache)
class NearbySearchCacheAdmin(admin.ModelAdmin):
    list_display = ('grid_key', 'created_at')
    search_fields = ('grid_key',)
    filter_horizontal = ('places',)


@admin.register(TextSearchCache)
class TextSearchCacheAdmin(admin.ModelAdmin):
    list_display = ('query', 'created_at')
    search_fields = ('query',)
    filter_horizontal = ('places',)


@admin.register(PlaceCard)
class PlaceCardAdmin(admin.ModelAdmin):
    list_display = ('place', 'created_at')
    search_fields = ('place__name',)
    list_select_related = ('place',)


@admin.register(SavedPlace)
class SavedPlaceAdmin(admin.ModelAdmin):
    list_display = ('user', 'place', 'visited', 'visited_at', 'visibility', 'created_at')
    list_filter = ('visited', 'visibility')
    search_fields = ('user__username', 'place__name')
    list_select_related = ('user', 'place')
    raw_id_fields = ('place',)


@admin.register(PlaceList)
class PlaceListAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'visibility', 'updated_at')
    list_filter = ('visibility',)
    search_fields = ('name', 'owner__username')
    list_select_related = ('owner',)
    filter_horizontal = ('items',)


class CircleMembershipInline(admin.TabularInline):
    model = CircleMembership
    extra = 1


@admin.register(Circle)
class CircleAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'created_at')
    search_fields = ('name', 'owner__username')
    list_select_related = ('owner',)
    inlines = [CircleMembershipInline]


@admin.register(Friendship)
class FriendshipAdmin(admin.ModelAdmin):
    list_display = ('from_user', 'to_user', 'status', 'created_at')
    list_filter = ('status',)
    search_fields = ('from_user__username', 'to_user__username')
    list_select_related = ('from_user', 'to_user')
