# Venturing

**Point your phone at a building and find out what it is.**

Venturing makes it easier and more fun to explore Boston on foot. You can walk past a statue, a storefront or an old brick building, take a photo, and get a card telling you what it is, why it matters, whether it's open, what it costs, and the nearest T stop. Then save it, check it off once you've been, and see where your friends are going.

Built at **BostonHacks 2026**.

---

## The problem

Boston is full of places that are easy to walk past without noticing: historic buildings, plaques, small museums, a coffee shop down a side street. If you want to know what you're looking at, you usually have to guess the name, type it into a search engine and scroll through results. Keeping track of places you want to visit ends up spread across screenshots, notes apps and map pins, and none of it is easy to share with friends.

## What Venturing does

### 📸 Scan
Take a photo of what's in front of you. The app sends the photo together with your **GPS location** and **compass heading**, and the backend works out which place you're looking at:

1. **Find nearby candidates.** It pulls places within about 150 m from Google Places and Wikipedia's geosearch, in parallel, then dedupes them.
2. **Filter by direction.** It keeps the places within ±70° of where your phone is pointing, nearest first, so the building behind you doesn't get picked. When GPS is shaky it also keeps the few closest places whichever way they are.
3. **Vision match.** It sends the photo and the numbered shortlist to Gemini, which has to pick from that list and give a confidence score. It isn't allowed to invent a place. If none fit but Gemini can read a name on a sign, the backend searches Google for that name and accepts a place with that name within 150 m.
4. **Respond by confidence.** High confidence opens the place card directly. Medium confidence asks *"Is it one of these?"* with the top 3. Low confidence says so and points you to search.

### 🔎 Search
If you aren't standing at the place, type its name. Results are biased toward your location, or toward the center of Boston if you haven't shared it.

### 🗂️ Place cards
Scan and search both end on the same card:
- A short **bio** written by Gemini from real facts only (Google data and the Wikipedia summary), so it doesn't make things up
- **Rating**, **price range** and **opening hours** from Google
- **Nearest T stop**, with its lines and walking time, from the MBTA API
- **How many of your friends are interested** in going

### ✅ Saved places
- Save any place to **My saved locations**
- Tick **visited** and choose the date you went (any date, not only today)
- Add your own **custom tags** ("date night", "rainy day", "take parents")
- Search, filter (price, type, visited, visibility) and sort your list
- Give each saved place its own **privacy setting**: private, friends, a specific circle, or public

### 👥 Social
- **Friend requests**: find people by username, send, accept or decline
- **Friends feed** on Home: places your friends have saved or recently visited (only the ones they've chosen to share with you)
- **Profiles** with friend, saved and visited counts
- **Mark interest** in a place so it shows up in your friends' "friends interested" count
- **Circles**, small groups of friends you can share places with

The API also supports **activities** (posting a plan at a place that friends can reply "interested" or "going" to). The mobile UI for that is the next thing to build.

---

## How it works

```
┌──────────────────────┐        HTTPS / JSON        ┌───────────────────────────┐
│  Mobile app (Expo)   │  ───────────────────────▶  │   Django REST API         │
│  camera, GPS,        │                            │                           │
│  compass, UI         │  ◀───────────────────────  │   Postgres = the cache    │
└──────────────────────┘                            └─────────────┬─────────────┘
                                                                  │
                         ┌───────────────┬───────────────┬────────┴──────┐
                         ▼               ▼               ▼               ▼
                   Google Places     Wikipedia        MBTA V3        Gemini
                   nearby, text,     geosearch,       nearest stop   vision match,
                   details           summaries                       bio writing
```

### The database is the cache
External APIs are slow and some of them cost money, so the backend stores every reusable response and always checks the database before calling out:

| Data | Cached? |
|---|---|
| Nearby candidates (by ~100 m grid cell) | Yes, 7 days |
| Text search results | Yes, 7 days |
| Rating, price and hours | Yes, refreshed after 7 days; only fetched when a card is opened |
| Wikipedia summary, bio and nearest T stop | Yes, permanently |
| Vision match | Never, because every photo is different |
| Friends interested | Never, computed live on each request |

A `warm_cache` command pre-loads the demo locations so nothing waits on an external API during the demo.

### Built to fail gracefully
Every external call has an 8 second timeout and a fallback, so one service going down doesn't break the app:
- Google Places down during a scan → use Wikipedia candidates only
- Vision match fails → show the candidates and let the user pick
- Place details fail → show the card without rating, price or hours
- Bio generation fails → use the Wikipedia summary instead

### Privacy is handled in one place
All visibility checks (private / friends / circle / public) go through helpers in [`api/app/permissions.py`](api/app/permissions.py) and are never written inline in views. Visibility is checked live, so unfriending someone or leaving a circle hides things straight away. Anything you aren't allowed to see returns 404 rather than 403, so private items can't be found by guessing IDs.

---

## Tech stack

| | |
|---|---|
| **Mobile** | Expo SDK 58, React Native, TypeScript, Expo Router, expo-camera, expo-location (GPS and heading), expo-secure-store |
| **Backend** | Python, Django, Django REST Framework, token auth |
| **Database** | SQLite locally, Postgres in production |
| **AI** | Google Gemini (vision match and bio writing, both with structured JSON output) |
| **Data** | Google Places API (New), Wikipedia, MBTA V3 API |
| **Hosting** | Vercel, with Postgres on Neon |

## Repo layout

```
api/                 Django REST API
  app/
    models.py        places, caches, saved places, tags, friends, circles, activities
    views.py         thin views: validate, call services, serialize
    permissions.py   all visibility and privacy logic
    geo.py           bearing and heading filter
    services/        one module per external API (google_places, wiki, mbta, llm, ...)
    management/commands/
      warm_cache.py  pre-cache the demo locations
      seed_demo.py   fill the DB with demo users, friends and saved places
mobile/              Expo / React Native app
  src/
    app/             screens (file-based routes): tabs, place/[id], user/[id], scan
    api/             everything that talks to the backend
    components/      reusable UI
    hooks/           useLocation, useHeading, usePlace, ...
```

---

## Running it locally

### Backend

Needs Python 3.14 and [pipenv](https://pipenv.pypa.io/).

```bash
cd api
```

```bash
pipenv install
```

```bash
cp .env.example .env
```

Fill in `.env` with your keys: `GOOGLE_PLACES_KEY`, `LLM_API_KEY` (Gemini), `MBTA_KEY`, and `WIKI_CONTACT` (a URL or email for Wikipedia's User-Agent).

```bash
pipenv run python manage.py migrate
```

```bash
pipenv run python manage.py warm_cache
```

```bash
pipenv run python manage.py seed_demo
```

```bash
pipenv run python manage.py runserver 0.0.0.0:8000
```

`seed_demo` creates demo users with friends, saved places and activities, and writes their logins to `demo_logins.csv`. Run `warm_cache` first, because it only uses places already in the database.

### Mobile app

```bash
cd mobile
```

```bash
npm install
```

Create `mobile/.env.local` with the API's address:

```
EXPO_PUBLIC_API_URL=http://localhost:8000
```

- iOS simulator: `http://localhost:8000`
- Android emulator: `http://10.0.2.2:8000`
- Real phone: `http://<your-computer's-LAN-IP>:8000`. Add that IP to `ALLOWED_HOSTS` in `api/.env`.

```bash
npx expo start
```

Scanning needs a real phone, because simulators have no compass. Without a heading, the API falls back to ranking candidates by distance only.

---

## Deploying the backend

The API runs on Vercel with Postgres on [Neon](https://neon.com).

1. In Vercel, import this repo as a project and set **Root Directory** to `api`. Vercel detects Django, installs from `Pipfile.lock` and runs `collectstatic` on its own.
2. Add these environment variables before the first deploy, because the build loads Django's settings:

   | Variable | Value |
   |---|---|
   | `DJANGO_SECRET_KEY` | a long random string |
   | `DATABASE_URL` | Neon's **pooled** connection string (the host contains `-pooler`) |
   | `GOOGLE_PLACES_KEY`, `LLM_API_KEY`, `MBTA_KEY`, `WIKI_CONTACT` | same as local |

   Leave `DEBUG` unset. `ALLOWED_HOSTS` is only needed for hostnames Vercel doesn't know about. Set `DATABASE_URL` for **Production** only, so preview deployments can't touch real data.
3. In the project's settings, make sure **Enable access to System Environment Variables** is on. `settings.py` uses them for `ALLOWED_HOSTS`.
4. Check `https://<your-project>.vercel.app/api/health/`.

Deploys don't run migrations. After adding one, run it from your computer with Neon's **direct** connection string (no `-pooler`), before deploying the code that needs it. This asks for the string so it stays out of your shell history (zsh):

```bash
read -rs "NEON_URL?Neon direct URL: "
```

```bash
PIPENV_DONT_LOAD_ENV=1 DATABASE_URL="$NEON_URL" pipenv run python manage.py migrate
```

---

## What's next

- Activities UI: post plans at a place and reply interested or going
- Live train arrival times on the place card (MBTA predictions)
- Walking routes that link several saved places together
- Choosing individual friends to share a place with, instead of setting up a circle first
