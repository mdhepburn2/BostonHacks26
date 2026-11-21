# Boston Walking App: Backend

## What this project is

A hackathon app that makes exploring Boston easier and more fun. Users find out about a place in one of two ways:

1. **Scan:** take a photo while standing near a place. The backend uses GPS, compass heading and a vision LLM to work out what it is.
2. **Search:** type the name of a place they know about but aren't at.

Either way they get a **place card**: name, bio, rating, price range, hours, nearest T stop, and how many of their friends are interested in going.

Users keep a list of saved places and check off the ones they've visited (with the date they went, which can be any date). They can group saved places into lists and choose who can see each one.

Social features are built **after** the place APIs work: friends, circles (groups for making plans), activity posts that friends can reply "interested" or "going" to, and marking interest in a friend's saved places.

This repo is the **backend only**: a Django REST Framework API that the mobile app (Expo / React Native, built separately) talks to.

## Stack

- Python, Django, Django REST Framework
- **pipenv** for dependencies and the virtualenv (not venv, not pip directly)
- django-cors-headers, python-dotenv, requests, Pillow
- DRF TokenAuthentication for user accounts (added in Phase 2)
- SQLite for local development, Postgres in production (via dj-database-url)
- Deployed on Render or Railway with gunicorn

### pipenv usage
- Add a package: `pipenv install <package>`. This updates `Pipfile` and `Pipfile.lock`; commit both.
- Run Django commands: `pipenv run python manage.py <command>`, or `pipenv shell` first.
- Never create a `venv/` folder or a `requirements.txt` unless the deploy host requires one. If it does, generate it with `pipenv requirements > requirements.txt`.

## Project layout

```
bostonhacks/         Django project config (settings.py, urls.py, wsgi.py, asgi.py)
app/                 the single Django app; all models and endpoints live here
  models.py
  serializers.py
  views.py
  urls.py            (create this; include it from bostonhacks/urls.py under /api/)
  admin.py
  permissions.py     (create) visibility and privacy checks
  geo.py             (create) bearing + heading filter
  services/          (create) one module per external API
    google_places.py   nearby search, text search, place details
    wiki.py
    candidates.py      cache check + parallel fetch + dedupe + upsert
    llm.py             vision match + bio writing
    mbta.py
  management/commands/
    warm_cache.py      pre-caches demo locations
  migrations/
  tests.py
manage.py
Pipfile
Pipfile.lock
Claude outputs/      planning docs, not code; don't import from or modify
```

Keep everything in the one `app` app. Don't create new Django apps.

## How the place flows work

### Scan flow: `POST /api/identify/`
1. App sends a photo, lat, lng and an optional compass heading (degrees).
2. **Candidate generation (cached):** round the coordinates to 3 decimals as a grid key and check `NearbySearchCache`. On a miss, call Google Places Nearby Search and Wikipedia geosearch in parallel, dedupe the results, upsert them as `Place` rows and save the cache entry.
3. **Heading filter (not cached, runs every request):** keep candidates within ±45° of the user's heading, sorted by distance, max 8. If nothing survives or no heading was sent, fall back to all candidates sorted by distance.
4. **Vision match (never cached):** resize the photo to ~1024px and send it with the numbered candidate list to a vision LLM. The LLM must return JSON and may only pick from the given candidates.
5. Map confidence to status: >= 0.7 `matched`, 0.4 to 0.7 `ambiguous` (return top 3), < 0.4 `not_found`.

### Search flow: `GET /api/places/search/?q=&lat=&lng=`
1. Normalize the query (lowercase, trimmed, collapsed spaces) and check `TextSearchCache`.
2. On a miss, call Google Places Text Search (New) with a location bias. Use the user's lat/lng if sent, otherwise the center of Boston. Upsert results as `Place` rows and save the cache entry.
3. Return a short list of results (id, name, address, lat, lng). The app then opens a place card for the one the user picks.

### Place card flow: `GET /api/places/<id>/`
Both scan and search end here.
1. **Place details:** if the `Place` doesn't have details yet, or they're older than 7 days, call Google Place Details for rating, rating count, price level and opening hours and store them on the `Place`. Only fetch details when a card is opened, never for every nearby candidate, since these fields bill at a higher-priced tier.
2. **Card cache:** check `PlaceCard` for this place. On a miss, gather facts (stored Place data + Wikipedia summary + nearest MBTA stop), have the LLM write the bio, and save it. The LLM must use **only the provided facts**.
3. **Friends interested (live, never cached):** if the request is authenticated, count the requester's accepted friends who have a `PlaceInterest` on this place. If not authenticated, return 0.
4. Assemble the response from the `Place` fields + `PlaceCard` + the live count.

## Core rule: the database is the cache

Every external API response that can be reused gets stored. Always check the DB before calling an external API.

| Data | Where it's stored | Expires? |
|---|---|---|
| Nearby search results | `NearbySearchCache` (grid key -> Places) | Optional, 7 days |
| Text search results | `TextSearchCache` (normalized query -> Places) | 7 days |
| Basic place data | `Place` fields + `Place.raw_data` | No |
| Rating, price level, hours | `Place` fields | Refresh after 7 days |
| Wikipedia summary | `Place.wiki_summary` | No |
| Bio + nearest T stop | `PlaceCard` (one per place) | No |
| Vision match result | never cached (every photo is different) | n/a |
| Friends interested count | never cached (computed per request) | n/a |
| Live train predictions | never stored, fetched fresh | n/a |

## Models

All in `app/models.py`. Use Django's built-in `User` model for accounts.

### Place data (Phase 1)
- **Place:** `external_id` (unique; Google place_id or Wikipedia pageid), `source` (google/wiki), `name`, `address`, `lat`, `lng`, `types` (JSON), `raw_data` (JSON), `wiki_title`, `wiki_summary`, `rating` (nullable float), `rating_count` (nullable int), `price_level` (nullable string), `opening_hours` (JSON list of weekday strings, nullable), `details_fetched_at` (nullable datetime), `updated_at`. Always upsert by `external_id` and never create duplicates.
- **NearbySearchCache:** `grid_key` (unique, e.g. "42.358,-71.057"), many-to-many to Place, `created_at`.
- **TextSearchCache:** `query` (unique, normalized), many-to-many to Place, `created_at`.
- **PlaceCard:** one-to-one with Place, `bio` (text), `nearest_t` (JSON), `created_at`.
- **IdentifyLog** (optional): photo, coordinates, heading, result JSON, `created_at`. For debugging and demos.

### Saving and lists (Phase 2)
- **SavedPlace:** FK `user`, FK `place`, `visited` (bool), `visited_at` (nullable date, set by the user to whenever they went), `note` (optional text), `visibility`, FK `circle` (nullable, required when visibility is `circle`), `created_at`. Unique on (user, place). This is the single source of truth for whether a user has visited a place.
- **PlaceList:** FK `owner`, `name`, `description`, `visibility`, FK `circle` (nullable, required when visibility is `circle`), many-to-many to `SavedPlace` (`items`), `created_at`, `updated_at`. Adding a place to a list creates the `SavedPlace` first if it doesn't exist.

### Social (Phase 3)
- **Friendship:** FK `from_user`, FK `to_user`, `status` (pending / accepted / declined), `created_at`. Unique on (from_user, to_user). Two users are friends when an accepted row exists in either direction.
- **Circle:** `name`, `description`, FK `owner`, many-to-many to `User` through **CircleMembership** (FK circle, FK user, `role` owner/member, `joined_at`), `created_at`.
- **PlaceInterest:** FK `user`, FK `place`, FK `via_saved_place` (nullable; set when the interest came from a friend's saved place), `created_at`. Unique on (user, place).
- **Activity:** FK `author`, FK `place`, `title`, `description`, `starts_at` (datetime), `visibility`, FK `circle` (nullable, required when visibility is `circle`), `created_at`.
- **ActivityResponse:** FK `activity`, FK `user`, `status` (interested / going), `created_at`, `updated_at`. Unique on (activity, user).

### Visibility
One shared choice set used by SavedPlace, PlaceList and Activity:

| Value | Who can see it |
|---|---|
| `private` | only the owner |
| `friends` | the owner + accepted friends |
| `circle` | the owner + members of the chosen circle |
| `public` | any logged-in user |

**All visibility filtering goes through helpers in `app/permissions.py`** (for example a `visible_to(viewer)` queryset method per model). Never write visibility checks inline in a view. A privacy bug means showing someone's private data, so keep the logic in one place and test it.

## API contract

Don't change these shapes without telling the frontend team. All URLs are under `/api/`.

### Phase 1: places (no auth required)

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/health/` | Sanity check |
| POST | `/api/identify/` | Scan. Multipart: `image`, `lat`, `lng`, `heading` (optional) |
| GET | `/api/places/search/?q=&lat=&lng=` | Search by name. lat/lng optional |
| GET | `/api/places/<id>/` | Place card |

**Identify response:**
```json
{
  "status": "matched | ambiguous | not_found",
  "place": { "id": 0, "name": "", "lat": 0, "lng": 0 },
  "candidates": [ { "id": 0, "name": "", "lat": 0, "lng": 0 } ],
  "confidence": 0.0
}
```

**Search response:**
```json
{
  "results": [ { "id": 0, "name": "", "address": "", "lat": 0, "lng": 0 } ]
}
```

**Place card response:**
```json
{
  "id": 0,
  "name": "",
  "bio": "",
  "rating": 4.6,
  "rating_count": 1234,
  "price_range": "$$",
  "hours": ["Monday: 9:00 AM - 5:00 PM", "..."],
  "nearest_t": { "stop": "", "lines": [""], "walk_min": 0 },
  "friends_interested": 0,
  "saved": { "id": 0, "visited": false, "visited_at": null }
}
```
- `rating`, `rating_count`, `price_range` and `hours` are `null` when Google has no data (common for landmarks and Wikipedia-only places).
- `price_range` is Google's price level mapped to `"$"` through `"$$$$"`, or `null`.
- `saved` is `null` if the user hasn't saved the place or isn't logged in.
- `friends_interested` is always present and is 0 when not logged in.

### Phase 2: accounts, saved places, lists (auth required)

Auth uses DRF tokens: the app sends `Authorization: Token <token>`.

| Method | URL | Purpose |
|---|---|---|
| POST | `/api/auth/register/` | Create account, returns token |
| POST | `/api/auth/login/` | Returns token |
| GET | `/api/me/` | Current user |
| GET / POST | `/api/saved/` | List my saved places / save a place |
| PATCH / DELETE | `/api/saved/<id>/` | Update visited, visited_at, note, visibility / unsave |
| GET / POST | `/api/lists/` | My lists / create a list |
| GET / PATCH / DELETE | `/api/lists/<id>/` | View, edit, delete a list |
| POST | `/api/lists/<id>/items/` | Add a place (body: `place_id`) |
| DELETE | `/api/lists/<id>/items/<saved_id>/` | Remove a place from a list |

**Register / login:**
- `POST /api/auth/register/` body: `username`, `password`, `email` (optional). 201 on success.
- `POST /api/auth/login/` body: `username`, `password`. 200 on success, 400 with `{"detail": ...}` on a wrong username/password.
- Usernames are unique ignoring case, and login ignores case.
- Both return:
```json
{ "token": "", "user": { "id": 0, "username": "", "email": "" } }
```
- `GET /api/me/` returns the `user` object.

**Saving and list rules:**
- `GET /api/saved/` and `GET /api/lists/` return `{"results": [...]}`. `GET /api/saved/?visited=true|false` filters.
- `POST /api/saved/` body: `place_id` plus any of `visited`, `visited_at`, `note`, `visibility`, `circle_id`. Returns 201, or 200 with the existing saved place (unchanged) if it was already saved. Use PATCH to edit it.
- Sending `visited_at` marks the place visited. `visited: true` with no date uses today. `visited: false` clears the date. Future dates are rejected.
- `visibility: "circle"` needs a `circle_id` for a circle the user belongs to. Any other visibility clears `circle_id`.
- Unsaving a place removes it from the user's lists. Deleting a list, or removing an item from it, keeps the places saved.
- `POST /api/lists/<id>/items/` returns the list shape: 201 if the place was added, 200 if it was already in the list. Item DELETE and list/saved DELETE return 204.
- Phase 2 endpoints only reach the requester's own saved places and lists; anyone else's return 404.
- `Circle` and `CircleMembership` models exist already (for the `circle` FK) but have no endpoints until Phase 3. Make them in the admin for now.

**Saved place shape:**
```json
{
  "id": 0,
  "place": { "id": 0, "name": "", "lat": 0, "lng": 0 },
  "visited": false,
  "visited_at": null,
  "note": "",
  "visibility": "private | friends | circle | public",
  "circle_id": null,
  "created_at": ""
}
```

**List shape:**
```json
{
  "id": 0,
  "name": "",
  "description": "",
  "visibility": "private | friends | circle | public",
  "circle_id": null,
  "items": [ "<saved place shape>" ],
  "visited_count": 0,
  "total_count": 0
}
```

### Phase 3: social (auth required)

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/friends/` | My friends |
| GET | `/api/friends/requests/` | Pending requests to me |
| POST | `/api/friends/requests/` | Send a request (body: `username`) |
| POST | `/api/friends/requests/<id>/accept/` | Accept |
| POST | `/api/friends/requests/<id>/decline/` | Decline |
| DELETE | `/api/friends/<user_id>/` | Unfriend |
| GET | `/api/users/<id>/saved/` | Their saved places that I'm allowed to see |
| GET | `/api/users/<id>/lists/` | Their lists that I'm allowed to see |
| POST / DELETE | `/api/places/<id>/interest/` | Mark / unmark interested. Optional body: `via_saved_place_id` |
| GET / POST | `/api/circles/` | My circles / create one |
| GET / PATCH / DELETE | `/api/circles/<id>/` | View, edit, delete (owner only for edit/delete) |
| POST | `/api/circles/<id>/members/` | Add a member (owner only, must be a friend) |
| DELETE | `/api/circles/<id>/members/<user_id>/` | Remove a member, or leave the circle |
| GET | `/api/activities/` | Feed of activities I'm allowed to see, upcoming first |
| POST | `/api/activities/` | Post an activity |
| GET / PATCH / DELETE | `/api/activities/<id>/` | View, edit, delete (author only for edit/delete) |
| POST / DELETE | `/api/activities/<id>/respond/` | Reply interested/going (body: `status`) / remove reply |

**Friends:**
- `GET /api/friends/` returns `{"results": [{"id": 0, "username": ""}]}`, A to Z.
- `GET /api/friends/requests/` returns `{"results": [<friend request shape>]}`: pending requests sent to me, newest first.
- `POST /api/friends/requests/` body: `username` (ignores case). Returns 201 with the new request, or 200 with the existing one if I already asked. If they already asked me, this accepts their request instead (200, `status: "accepted"`). Re-sending after they declined puts it back in their requests (201). 404 for an unknown username, 400 for myself or someone I'm already friends with.
- Accept / decline only work on pending requests sent to me (anything else is 404) and return the request shape. Accepting removes any other request between the two users.
- `DELETE /api/friends/<user_id>/` returns 204, or 404 if we aren't friends. It clears every request between the two users so either can send a new one.
- Friend checks (`friends_of`, `are_friends`, `friend_ids`) live in `app/permissions.py`.

**Friend request shape:**
```json
{
  "id": 0,
  "from_user": { "id": 0, "username": "" },
  "to_user": { "id": 0, "username": "" },
  "status": "pending | accepted | declined",
  "created_at": ""
}
```

**Activity shape:**
```json
{
  "id": 0,
  "author": { "id": 0, "username": "" },
  "place": { "id": 0, "name": "", "lat": 0, "lng": 0 },
  "title": "",
  "description": "",
  "starts_at": "",
  "visibility": "friends | circle | public",
  "circle_id": null,
  "counts": { "interested": 0, "going": 0 },
  "my_response": "interested | going | null"
}
```

Social rules:
- Only friends can be added to a circle.
- Interest on a friend's saved place is only allowed if that saved place is visible to the requester.
- Activities can't be `private` (there's no one to reply).

## External APIs

- **Google Places API (New):** Nearby Search (scan candidates), Text Search (search), Place Details (rating, price level, hours on the card). Always send an `X-Goog-FieldMask` header listing only the fields needed for that call, since billing depends on the fields requested. Nearby search radius is about 150m.
- **Wikipedia:** geosearch (`list=geosearch`, about 200m radius) to find nearby articles, and the REST summary endpoint for intro text used in the bio. No key needed.
- **MBTA V3 API:** `/stops` filtered by lat/lng and sorted by distance to find the nearest stop. `/predictions` for live trains if we add that feature.
- **LLM provider:** Gemini. Used for the vision match and writing the bio. Always request structured JSON output and validate it.

## Environment variables (`.env`)

- `DJANGO_SECRET_KEY`
- `DEBUG`
- `ALLOWED_HOSTS`
- `DATABASE_URL` (production)
- `GOOGLE_PLACES_KEY`
- `LLM_API_KEY`
- `MBTA_KEY`

## Conventions and rules

- **Never hardcode API keys or commit `.env` or `db.sqlite3`.** All secrets come from environment variables.
- Use pipenv for everything (see Stack).
- External API calls live in `app/services/`. Views stay thin: they validate input, call services and serialize output.
- Visibility and permission logic lives in `app/permissions.py` only.
- Every external HTTP call needs a timeout (8 seconds) and a fallback. A failed external call must not crash a request:
  - Places fails during scan -> use Wikipedia results only
  - Vision match fails -> return candidates with status `ambiguous`
  - Place Details fails -> return the card with `null` rating/price/hours
  - Bio generation fails -> return the card with a fallback bio (the Wikipedia summary, or empty)
  - Text search fails -> 502 with a friendly error message
- Return proper status codes: 400 for bad input, 401 when not logged in, 403 when not allowed to see or edit something, 404 for unknown objects, 502 when an upstream API fails.
- When a user isn't allowed to see an object, return 404 (not 403) so private objects can't be discovered by guessing IDs.
- Run the Places and Wikipedia calls in parallel with threads (DRF views are synchronous).
- Resize images before sending them to the LLM.
- LLM prompts must tell the model to use only the provided data. Validate every LLM response against the expected shape before saving it.
- Use `select_related` / `prefetch_related` on list endpoints to avoid N+1 queries.
- Log the timing of each step of a request so we can see what's slow.
- Keep it simple. This is a hackathon, so prefer working and readable code over clever abstractions.
- Don't make git commits. Leave changes uncommitted; the user reviews them and commits themselves.

## Build order

### Phase 1: place APIs (no accounts yet)
1. Project skeleton + health endpoint + `app/urls.py` wired under `/api/`
2. Place models (Place, NearbySearchCache, TextSearchCache, PlaceCard) + admin
3. Phase 1 endpoints returning mock data (unblocks frontend)
4. Deploy to Render/Railway with Postgres
5. Google Places (nearby, text search, details) + Wikipedia services
6. Candidate generation with caching
7. Heading filter
8. Vision LLM match (real `/identify/`)
9. Search with caching (real `/places/search/`)
10. Place card: details refresh + LLM bio + caching (real `/places/<id>/`) <- **MVP done here**
11. MBTA nearest stop on the card
12. Error handling pass
13. `warm_cache` management command for the demo

### Phase 2: accounts and saving
14. User accounts with DRF token auth (register, login, me)
15. Saved places with visited / visited_at, and `saved` on the place card
16. Lists with visibility settings

### Phase 3: social
17. Friendships (requests, accept, decline, unfriend)
18. Visibility helpers in `permissions.py` + viewing friends' saved places and lists (with tests)
19. Place interest + live `friends_interested` count on the card
20. Circles and membership
21. Activities, responses and the activity feed
