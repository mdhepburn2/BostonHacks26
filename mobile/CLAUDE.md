# Boston Walking App: Mobile

@AGENTS.md

## Scope rule

**Only change files inside `mobile/`.** The backend lives in `../api/` and has its own
CLAUDE.md. If a mobile feature needs a backend change (new endpoint, different response
shape, a bug in the API), stop and tell the user what's needed and why; don't edit `api/`.
Reading `../api/` to check how an endpoint behaves is fine.

Don't make git commits. Leave changes uncommitted for the user to review.

## What this app is

A hackathon app that makes exploring Boston easier and more fun. Users find out about a
place in one of two ways:

1. **Scan:** point the camera at a place and take a photo. The app sends the photo, GPS
   location and compass heading to the API, which works out what it is.
2. **Search:** type the name of a place they know about but aren't at.

Either way they land on a **place card**: name, bio, rating, price range, hours, nearest
T stop, and how many friends are interested.

Later phases add accounts, saved places (with visited dates), lists, friends, circles and
activities. Build those only after the scan → card and search → card flows work end to end.

## App structure (tabs)

The app has four tabs. This list isn't final; more features will be added, so keep screens
and components easy to extend.

### Home
- **Recently saved:** my most recently saved places (a short horizontal row or list), each opening
  the place card.
- **Friends feed:** places my friends have saved that I'm allowed to see, newest first. Each item
  shows the friend, the place, and whether they've visited it. Tapping it opens the place card.
- Empty states: "Save your first place" (link to Search or Scan) and "Add friends to see
  their places" (link to user search).

### Saved
- All my saved places.
- **Search** within my saved places by name.
- **Filter** by price range, place type (restaurant, museum, park, landmark, ...), visited /
  not visited, and visibility. Sort by date saved, date visited, name.
- **Visibility per place:** private, public, or visible to certain friends (see "Open API
  questions" below for what the API supports).
- **Visited checkbox:** checking it asks for the date (defaults to today, any date allowed);
  unchecking clears it.
- Lists (grouping saved places) also live here once the API has them.

### Profile
- My profile as **other people see it**: username, avatar or initials, stats (friend count,
  saved count, visited count), and the saved places and lists visible to the viewer.
- The same screen is used for viewing someone else's profile (`user/[id]`). On my own
  profile, add edit, settings and log out. On someone else's, add friend / pending / friends
  actions.
- Friend requests (incoming and sent) are reached from here.

### Search
- One search bar with two modes (segmented control): **Places** and **People**.
- **Places:** the place search flow below. Results open the place card, which has the Save button.
  This is how users add places manually without scanning.
- **People:** search users by username → open their profile → send a friend request.

### Scan
Scan is the core feature but isn't one of the four tabs. Put a prominent **Scan button** (camera
icon) on Home and Search that opens the camera as a full-screen modal route (`scan.tsx`). If
the user later wants Scan as its own tab, it's an easy move.

### Shared screens (outside the tabs)
- `place/[id]` place card: Save / Unsave, visibility, visited + date, "interested".
- `user/[id]` someone else's profile.
- `scan` camera modal.
- `login` / `register`.

## Open API questions

These tab features need things the API doesn't have yet (as of `../api/CLAUDE.md`). When
you reach one, tell the user what's needed. Don't build the backend part, and don't fake it
long-term in the app. Mocking in `src/api/` to unblock UI work is fine if you mark it clearly.

| Feature | What's missing in the API |
|---|---|
| Home friends feed | No feed endpoint for friends' visible saved places (only `/api/users/<id>/saved/` per user) |
| Search people | No user search endpoint (e.g. `GET /api/users/search/?q=`) |
| Profile stats | No endpoint for a user's profile + counts (friends, saved, visited) |
| "Visible to certain friends" | Visibility is `private / friends / circle / public`. Per-friend picking would need a circle (a group of friends) or a new option |
| Filter saved by price / type | `/api/saved/` returns only `place {id, name, lat, lng}`. Filtering needs `price_range` and `types` on each item, or query params on the endpoint |
| Accounts, saving, friends | All of Phase 2 and 3 isn't built yet |

## Stack

- Expo SDK 58, React Native, TypeScript (strict), React Compiler on
- **Expo Router** with file-based routes in `src/app/` (see AGENTS.md)
- Native tabs via `expo-router/native-tabs` (`src/components/app-tabs.tsx`)
- npm (there's a `package-lock.json`). Add packages with `npx expo install <pkg>`, never `npm install <pkg>`
- Expected Expo modules for the core features (install them when you need them):
  - `expo-camera` for the scan screen
  - `expo-location` for GPS and compass heading
  - `expo-secure-store` for the auth token (Phase 2)

Expo changes a lot between SDKs. Check the v58 docs before using any Expo API (see AGENTS.md).

## Project layout

```
src/
  app/                  routes only (every file is a screen)
    _layout.tsx         root layout (stack wrapping the tabs + shared screens)
    (tabs)/             the four tabs: index (Home), saved, profile, search
    place/[id].tsx      place card (opened from scan, search, feed, saved)
    user/[id].tsx       another user's profile
    scan.tsx            camera, presented as a full-screen modal
    login.tsx, register.tsx
  api/                  (create) everything that talks to the backend
    client.ts           base URL, fetch wrapper, auth header, error type
    places.ts           identify(), searchPlaces(), getPlace()
    types.ts            TypeScript types that mirror the API contract
  components/           reusable UI (PlaceCard pieces, CandidateList, ...)
  hooks/                useLocation, useHeading, usePlace, ...
  constants/theme.ts    colors, fonts, spacing; use these, not hardcoded values
assets/
```

The starter screens (`index.tsx`, `explore.tsx`, the Expo/React logos, `hint-row`, `web-badge`)
are template code. Replace or delete them as the real screens go in.

## Talking to the API

- Base URL comes from `EXPO_PUBLIC_API_URL`, set in `mobile/.env.local` (gitignored by the
  `.env*.local` rule; a plain `.env` is not ignored). Never hardcode it in components; read it
  once in `src/api/client.ts`.
  - Deployed API: the Render URL (ask the user for it).
  - Local API on a real phone: `http://<your-mac-LAN-IP>:8000`. The Django server has to run with
    `runserver 0.0.0.0:8000`, and that IP has to be in the API's `ALLOWED_HOSTS` (an API-side
    change, so tell the user).
  - iOS simulator: `http://localhost:8000` works. Android emulator: `http://10.0.2.2:8000`.
- All requests go through `src/api/`. Screens never call `fetch` directly.
- Keep the types in `src/api/types.ts` matching the contract below. If the API returns
  something different from the contract, tell the user instead of quietly adjusting the types.
- Error handling the UI must cover:
  - `400` bad input: show the message
  - `401` not logged in (Phase 2+): send to login
  - `404` unknown or not visible: "Place not found"
  - `502` upstream API down: friendly "try again" with a retry button
  - network error or timeout: same as 502. Use about a 20s timeout for `/identify/` (it calls a vision
    model) and about 10s for everything else.
- Show a loading state for every request. Scan can take a few seconds, so give it a clear
  "Identifying..." state.

### Phase 1 endpoints (live now, no auth)

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/health/` | Sanity check |
| POST | `/api/identify/` | Scan. Multipart: `image`, `lat`, `lng`, `heading` (optional) |
| GET | `/api/places/search/?q=&lat=&lng=` | Search by name. lat/lng optional (send both or neither) |
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
- `matched`: go straight to the place card for `place.id`.
- `ambiguous`: show "Is it one of these?" with `candidates` (up to 3) and let the user pick.
- `not_found`: say so, and still offer `candidates` if there are any, plus a link to search.
- `place` is `null` unless the status is `matched` or `ambiguous`.

**Search response:**
```json
{ "results": [ { "id": 0, "name": "", "address": "", "lat": 0, "lng": 0 } ] }
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
- `rating`, `rating_count`, `price_range`, `hours` can each be `null` (common for landmarks).
  Hide that row; don't show "null" or "0 stars".
- `nearest_t` can be `null`. `bio` can be an empty string.
- `saved` is `null` when not saved or not logged in. `friends_interested` is always a number.

### Phase 2 and 3 endpoints (not built yet)

Accounts (DRF token, sent as `Authorization: Token <token>`), saved places, lists, friends,
circles, interest and activities. The full contract is in `../api/CLAUDE.md` under
"API contract". Read it from there when you start those features, and check
`../api/app/urls.py` to see what actually exists before building UI against it.

## Scan flow details

1. Ask for camera and location permission the first time the user opens the scan tab. Explain
   why, and handle "denied" with a message and a button to open settings.
2. While the camera is open, keep a live location and compass heading:
   - location from `expo-location`, high accuracy
   - heading from `expo-location`'s heading watcher. Send **`trueHeading`** (true north, which
     is what the API's bearing math uses). If it's negative or unavailable, leave `heading` out.
   - Note: the compass needs a real device. Simulators have no heading, and that's fine
     because the API falls back to distance only.
3. On shutter: take the photo at reduced quality (the API resizes to 1024px anyway, so a smaller
   upload is faster), grab the current lat/lng/heading, and POST multipart to `/api/identify/`.
4. React Native FormData file: `{ uri, name: 'photo.jpg', type: 'image/jpeg' }`. Don't set
   `Content-Type` yourself, because fetch has to add the multipart boundary.
5. Route on `status` as described above.

## Search flow details

- Debounce typing (about 400ms) and skip queries under 2 characters.
- Send the user's lat/lng if location permission was granted. If not, leave both out.
- Tapping a result opens `place/[id]`.

## UI conventions

- Use `constants/theme.ts` (Colors, Spacing, Fonts) and the themed components. Support light
  and dark mode.
- Mobile-first: big tap targets, safe areas (`react-native-safe-area-context`), test on a real
  phone for camera and compass.
- Use `expo-image` for images and `expo-symbols` / SF Symbols for icons where possible.
- Keep it simple. This is a hackathon, so prefer readable, working code over clever abstractions.
  No state library until it's clearly needed; React state plus small hooks is enough for Phase 1.

## Before saying a task is done

```bash
npx tsc --noEmit
npx expo lint
```
Both must pass. For UI changes, also run the app (simulator or Expo Go) and check the screen.

## Build order

### Phase 1: places
1. Clean out the starter template. Set up the four tabs (Home, Saved, Profile, Search) with
   placeholder screens, plus the `place/[id]` and `scan` routes
2. `src/api/` client + types + `EXPO_PUBLIC_API_URL`; hit `/api/health/` to prove the connection
3. Search tab (Places mode) → results list → place card
4. Place card screen (all fields, null handling, loading and error states)
5. Scan modal: camera + permissions, Scan button on Home and Search
6. Location + heading hooks
7. Identify call + matched / ambiguous / not_found handling → place card  <- **MVP done here**
8. Polish: error and retry states, empty states, app name and icon in `app.json`

### Phase 2: accounts and saving (once the API has them)
9. Register / login screens, token in `expo-secure-store`, auth header in the client
10. Save / unsave, visibility and visited (with date) from the place card
11. Saved tab: list, search, filters (price, type, visited, visibility), sort, visited checkbox
12. Home tab: recently saved row
13. Profile tab (my own): stats + my visible saved places, log out
14. Lists in the Saved tab: create, edit, visibility, add/remove places

### Phase 3: social (once the API has them)
15. Search tab People mode → `user/[id]` profile → friend request
16. Friend requests (from Profile): accept / decline; unfriend
17. Home tab: friends feed
18. "Interested" on places and on friends' saved places
19. Circles (also used for "visible to certain friends")
20. Activities feed, posting, interested/going replies
