from django.urls import path

from . import views

urlpatterns = [
    path('health/', views.health, name='health'),
    path('identify/', views.identify, name='identify'),
    path('places/search/', views.place_search, name='place-search'),
    path('places/<int:place_id>/', views.place_detail, name='place-detail'),

    # Phase 2: accounts, saved places, lists
    path('auth/register/', views.register, name='register'),
    path('auth/login/', views.login, name='login'),
    path('me/', views.me, name='me'),
    path('saved/', views.saved_places, name='saved-places'),
    path('saved/<int:saved_id>/', views.saved_place_detail, name='saved-place-detail'),
    path('lists/', views.place_lists, name='place-lists'),
    path('lists/<int:list_id>/', views.place_list_detail, name='place-list-detail'),
    path('lists/<int:list_id>/items/', views.place_list_items, name='place-list-items'),
    path('lists/<int:list_id>/items/<int:saved_id>/', views.place_list_item_detail, name='place-list-item-detail'),

    # Phase 3: social
    path('friends/', views.friends, name='friends'),
    path('friends/requests/', views.friend_requests, name='friend-requests'),
    path('friends/requests/<int:request_id>/accept/', views.accept_friend_request, name='friend-request-accept'),
    path('friends/requests/<int:request_id>/decline/', views.decline_friend_request, name='friend-request-decline'),
    path('friends/<int:user_id>/', views.unfriend, name='unfriend'),
]
