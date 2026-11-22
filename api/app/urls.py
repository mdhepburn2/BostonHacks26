from django.urls import path

from . import views

urlpatterns = [
    path('health/', views.health, name='health'),
    path('identify/', views.identify, name='identify'),
    path('places/search/', views.place_search, name='place-search'),
    path('places/<int:place_id>/', views.place_detail, name='place-detail'),

    # Phase 2: accounts, saved places, tags
    path('auth/register/', views.register, name='register'),
    path('auth/login/', views.login, name='login'),
    path('me/', views.me, name='me'),
    path('saved/', views.saved_places, name='saved-places'),
    path('saved/<int:saved_id>/', views.saved_place_detail, name='saved-place-detail'),
    path('tags/', views.tags, name='tags'),
    path('tags/<int:tag_id>/', views.tag_detail, name='tag-detail'),

    # Phase 3: social
    path('friends/', views.friends, name='friends'),
    path('friends/requests/', views.friend_requests, name='friend-requests'),
    path('friends/requests/<int:request_id>/accept/', views.accept_friend_request, name='friend-request-accept'),
    path('friends/requests/<int:request_id>/decline/', views.decline_friend_request, name='friend-request-decline'),
    path('friends/<int:user_id>/', views.unfriend, name='unfriend'),
    path('feed/', views.feed, name='feed'),
    path('users/search/', views.user_search, name='user-search'),
    path('users/<int:user_id>/', views.user_profile, name='user-profile'),
    path('users/<int:user_id>/saved/', views.user_saved_places, name='user-saved-places'),
    path('places/<int:place_id>/interest/', views.place_interest, name='place-interest'),
    path('circles/', views.circles, name='circles'),
    path('circles/<int:circle_id>/', views.circle_detail, name='circle-detail'),
    path('circles/<int:circle_id>/members/', views.circle_members, name='circle-members'),
    path('circles/<int:circle_id>/members/<int:user_id>/', views.circle_member_detail, name='circle-member-detail'),
    path('activities/', views.activities, name='activities'),
    path('activities/<int:activity_id>/', views.activity_detail, name='activity-detail'),
    path('activities/<int:activity_id>/respond/', views.respond_to_activity, name='activity-respond'),
]
