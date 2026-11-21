from django.urls import path

from . import views

urlpatterns = [
    path('health/', views.health, name='health'),
    path('identify/', views.identify, name='identify'),
    path('places/search/', views.place_search, name='place-search'),
    path('places/<int:place_id>/', views.place_detail, name='place-detail'),
]
