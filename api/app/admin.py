from django.contrib import admin

from .models import NearbySearchCache, Place, PlaceCard, TextSearchCache


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
