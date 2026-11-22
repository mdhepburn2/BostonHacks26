"""Fill the database with demo users, friendships, circles, saved places, tags,
place interest, activities and replies, so the app looks like lots of people use it.

    pipenv run python manage.py seed_demo
    pipenv run python manage.py seed_demo --csv ../demo_logins.csv

- Only uses Place rows that are already in the database (run `warm_cache` first);
  it never calls Google, Wikipedia, MBTA or Gemini. Places it can't find are skipped.
- Safe to rerun: it deletes the demo users listed below (and everything they own)
  and creates them again. Other users are never touched.
- Random choices use a fixed seed, so every run gives the same usernames, passwords
  and data. Dates are relative to now, so activities stay "upcoming" whenever you run it.
- Writes every login to a CSV (default: demo_logins.csv next to manage.py).
"""

import csv
import random
from datetime import datetime, time, timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from app.models import (
    Activity,
    ActivityResponse,
    Circle,
    CircleMembership,
    Friendship,
    Place,
    PlaceCard,
    PlaceInterest,
    SavedPlace,
    Tag,
    Visibility,
)
from app.permissions import are_friends, visible_activities, visible_saved_places

User = get_user_model()

SEED = 2026
HERO = 'jordan.lee'  # the account with the richest data; use it for the demo

# --- Users ----------------------------------------------------------------
# (username, first name, last name), grouped into friend clusters.
CLUSTERS = {
    'bu': [  # BU students / the hackathon crowd
        ('jordan.lee', 'Jordan', 'Lee'),
        ('priya_r', 'Priya', 'Raman'),
        ('marcusbell', 'Marcus', 'Bell'),
        ('sofia.alvarez', 'Sofia', 'Alvarez'),
        ('kenjiw', 'Kenji', 'Watanabe'),
        ('hannah.okafor', 'Hannah', 'Okafor'),
        ('liam_oc', 'Liam', "O'Connor"),
        ('aisha.k', 'Aisha', 'Khan'),
    ],
    'food': [  # North End foodies
        ('gina.eats', 'Gina', 'Marino'),
        ('tonydeluca', 'Tony', 'DeLuca'),
        ('rachelkim22', 'Rachel', 'Kim'),
        ('omar.haddad', 'Omar', 'Haddad'),
        ('bellarusso', 'Bella', 'Russo'),
        ('nate_f', 'Nate', 'Feldman'),
        ('chloe.ng', 'Chloe', 'Nguyen'),
    ],
    'history': [  # Freedom Trail regulars
        ('wbriggs1775', 'Walter', 'Briggs'),
        ('maya.patel', 'Maya', 'Patel'),
        ('eligoldberg', 'Eli', 'Goldberg'),
        ('gracesully', 'Grace', 'Sullivan'),
        ('tom_whitaker', 'Tom', 'Whitaker'),
        ('nadia.p', 'Nadia', 'Petrova'),
    ],
    'sports': [  # Sox fans
        ('kmccarthy', 'Kevin', 'McCarthy'),
        ('dani.reyes', 'Daniela', 'Reyes'),
        ('miketran', 'Mike', 'Tran'),
        ('jessfitz', 'Jessica', 'Fitzgerald'),
        ('ryandoyle_', 'Ryan', 'Doyle'),
        ('tasha.b', 'Tasha', 'Brooks'),
    ],
    'art': [  # museum people
        ('iris.chen', 'Iris', 'Chen'),
        ('leomoreau', 'Leo', 'Moreau'),
        ('zoe.adler', 'Zoe', 'Adler'),
        ('sam_oduya', 'Samuel', 'Oduya'),
        ('ava.lind', 'Ava', 'Lindqvist'),
        ('felixw', 'Felix', 'Wagner'),
    ],
    'city': [  # young professionals around town
        ('noahpark', 'Noah', 'Park'),
        ('emma.costa', 'Emma', 'Costa'),
        ('diego_s', 'Diego', 'Santos'),
        ('lilyhart', 'Lily', 'Hart'),
        ('ben.carter', 'Ben', 'Carter'),
        ('yara.m', 'Yara', 'Mansour'),
        ('calebwright', 'Caleb', 'Wright'),
    ],
}

# Which kinds of places each cluster tends to save.
CLUSTER_TASTES = {
    'bu': ['coffee', 'study', 'campus', 'food', 'history'],
    'food': ['food', 'coffee', 'nightlife'],
    'history': ['history', 'outdoors', 'museum'],
    'sports': ['sports', 'nightlife', 'food'],
    'art': ['museum', 'outdoors', 'coffee'],
    'city': ['nightlife', 'food', 'coffee', 'outdoors'],
}

# Extra friendships beyond each cluster, so the graph isn't a set of islands.
HERO_FRIENDS = [
    'gina.eats', 'tonydeluca', 'chloe.ng', 'maya.patel', 'iris.chen', 'leomoreau',
    'noahpark', 'emma.costa', 'kmccarthy', 'wbriggs1775',
]
HERO_INCOMING_REQUESTS = ['lilyhart', 'calebwright', 'yara.m']  # pending, sent to the hero
HERO_OUTGOING_REQUESTS = ['zoe.adler']  # pending, sent by the hero

# --- Places ---------------------------------------------------------------
# (exact Place name, category). Looked up in the DB; missing ones are skipped.
PLACES = [
    ('Faneuil Hall Marketplace', 'food'),
    ('Quincy Market', 'food'),
    ('Union Oyster House', 'food'),
    ("Mike's Pastry", 'food'),
    ('Boston Public Market', 'food'),
    ('Nud Pob Thai Cuisine', 'food'),
    ('Tatte Bakery & Cafe | Beacon St', 'coffee'),
    ('Pavement Coffeehouse - BU', 'coffee'),
    ('Bread O’Life Bakery', 'coffee'),
    ('Faneuil Hall', 'history'),
    ('Old North Church', 'history'),
    ('The Paul Revere House', 'history'),
    ('Park Street Church', 'history'),
    ('Granary Burying Ground', 'history'),
    ("John Hancock's Grave", 'history'),
    ('Basement Crypt of the Old North Church', 'history'),
    ('Faneuil Hall Visitor Center', 'history'),
    ('Dead Saints Tours', 'history'),
    ('Isabella Stewart Gardner Museum', 'museum'),
    ('Boston Athenaeum', 'museum'),
    ('Boston Public Library', 'study'),
    ('Mugar Memorial Library', 'study'),
    ('State Library of Massachusetts', 'study'),
    ('North End Branch of the Boston Public Library', 'study'),
    ('Marsh Chapel', 'campus'),
    ('George Sherman Union', 'campus'),
    ('Fenway Park', 'sports'),
    ('Tree House Brewing Company - Faneuil Hall', 'nightlife'),
    ('Fiyameta', 'nightlife'),
    ('Green Dragon Tavern', 'nightlife'),
    ('Freedom Trail', 'outdoors'),
    ('Brewer Fountain', 'outdoors'),
    ('Statue of Bill Russell', 'outdoors'),
    ('The Reading Bench', 'outdoors'),
]

CATEGORY_TAGS = {
    'food': ['cheap eats', 'date ideas', 'with visitors', 'north end'],
    'coffee': ['coffee', 'study spots', 'brunch'],
    'history': ['freedom trail', 'history', 'with visitors'],
    'museum': ['rainy day', 'museums', 'date ideas'],
    'study': ['study spots', 'quiet', 'rainy day'],
    'campus': ['campus', 'quiet'],
    'sports': ['game day', 'bucket list'],
    'nightlife': ['drinks', 'late night', 'date ideas'],
    'outdoors': ['photo spots', 'free', 'walks'],
}

CATEGORY_NOTES = {
    'food': ['Get the clam chowder.', 'Go before noon or the line is wild.', 'Split everything with the group.',
             'Cash only at a couple of stalls.', 'Worth it when family visits.', 'The cannoli is non-negotiable.'],
    'coffee': ['Oat latte is great.', 'Good outlets by the window.', 'Shakshuka for brunch.',
               'Quiet before 9am.', 'Almond croissant!!'],
    'history': ['Rangers give free talks.', 'Small but really interesting.', 'Great first stop on the trail.',
                'Took my parents here.', 'Go early, it gets packed with tours.'],
    'museum': ['Free if your name is Isabella.', 'The courtyard is unreal.', 'Plan for 2 hours at least.',
               'Thursday evenings are less crowded.'],
    'study': ['Bates Hall reading room.', 'Third floor is the quietest.', 'Wifi is solid.',
              'Courtyard is nice in the fall.'],
    'campus': ['Good spot between classes.', 'Pretty at sunset.'],
    'sports': ['Bleacher seats are the move.', 'Take the tour on an off day.', 'Fenway franks or bust.'],
    'nightlife': ['Ask for the back table.', 'Trivia on Wednesdays.', 'Great after work.', 'Hazy IPAs.'],
    'outdoors': ['Golden hour photos here.', 'Nice for a morning run.', 'Free and right off the trail.'],
}

# --- Circles --------------------------------------------------------------
# (owner, name, description, members). Members are made friends of the owner.
CIRCLES = [
    ('jordan.lee', 'BU Hack Squad', 'BostonHacks team. Late-night food runs and demo-day plans.',
     ['priya_r', 'marcusbell', 'kenjiw', 'liam_oc', 'aisha.k']),
    ('sofia.alvarez', 'Sunday Brunch Club', 'One brunch spot a week, no repeats.',
     ['jordan.lee', 'hannah.okafor', 'priya_r', 'emma.costa', 'chloe.ng']),
    ('gina.eats', 'North End Cannoli Crawl', 'Ranking every pastry in the North End, one cannoli at a time.',
     ['tonydeluca', 'bellarusso', 'rachelkim22', 'omar.haddad', 'nate_f', 'chloe.ng', 'jordan.lee']),
    ('wbriggs1775', 'Freedom Trail Walkers', 'History nerds walking the trail and arguing about dates.',
     ['maya.patel', 'eligoldberg', 'gracesully', 'tom_whitaker', 'nadia.p', 'diego_s']),
    ('kmccarthy', 'Fenway Bleacher Creatures', 'Sox games, ballpark franks, and heartbreak.',
     ['dani.reyes', 'miketran', 'jessfitz', 'ryandoyle_', 'tasha.b', 'marcusbell', 'noahpark']),
    ('iris.chen', 'Museum Free Nights', 'Catching every free and late-night museum hour in the city.',
     ['leomoreau', 'zoe.adler', 'sam_oduya', 'ava.lind', 'felixw', 'jordan.lee', 'hannah.okafor']),
    ('aisha.k', 'Mugar Study Buddies', 'Finals season accountability. Snacks mandatory.',
     ['jordan.lee', 'priya_r', 'hannah.okafor', 'kenjiw', 'sofia.alvarez']),
    ('noahpark', 'Comm Ave Roommates', 'Apartment 4B group chat, but for plans.',
     ['emma.costa', 'diego_s', 'ben.carter']),
]

# --- Activities -----------------------------------------------------------
# (author, place name, title, description, days from today, "HH:MM", visibility, circle name)
ACTIVITIES = [
    # Upcoming
    ('jordan.lee', "Mike's Pastry", 'Cannoli run after demos',
     "Celebrating (or coping) after judging. I'll grab a box for the table.", 1, '20:30', 'circle', 'BU Hack Squad'),
    ('liam_oc', 'George Sherman Union', 'Hack team dinner',
     'GSU food court, then planning what we build next.', 1, '18:00', 'circle', 'BU Hack Squad'),
    ('noahpark', 'Tree House Brewing Company - Faneuil Hall', 'After-work drinks',
     "First round's on me. Ask for the back table.", 1, '18:30', 'friends', None),
    ('priya_r', 'Boston Public Library', 'Study session in Bates Hall',
     'Finals grind. Quiet floor, snack break in the courtyard at 3.', 2, '13:00', 'friends', None),
    ('tonydeluca', 'Quincy Market', 'Lunch crawl through Quincy Market',
     'Everyone picks one stall and we share everything.', 2, '12:30', 'friends', None),
    ('emma.costa', 'Nud Pob Thai Cuisine', 'Cheap Thai dinner',
     'Best pad see ew on Comm Ave. Come hungry.', 2, '19:30', 'friends', None),
    ('gina.eats', 'Union Oyster House', 'Oyster night at the raw bar',
     "Half-dozen each and chowder. I'll put us on the list.", 3, '19:00', 'circle', 'North End Cannoli Crawl'),
    ('kenjiw', 'Pavement Coffeehouse - BU', 'Hackathon recap over coffee',
     'What worked, what broke, what we would do differently.', 3, '09:30', 'friends', None),
    ('felixw', 'Brewer Fountain', 'Morning run: Common + Public Garden loop',
     'Easy 5k pace, meet at the fountain.', 3, '07:30', 'public', None),
    ('wbriggs1775', 'Old North Church', 'Behind-the-scenes crypt tour',
     'Booked the basement crypt tour. Room for 6 more.', 4, '11:00', 'public', None),
    ('chloe.ng', 'Boston Public Market', 'Farmers market haul',
     'Shopping for a big group dinner. Come help carry.', 4, '10:00', 'friends', None),
    ('hannah.okafor', 'Marsh Chapel', 'Sunset on Marsh Plaza',
     'Finals decompression. Bring a blanket and a hot drink.', 4, '16:15', 'friends', None),
    ('kmccarthy', 'Fenway Park', 'Off-season Fenway tour',
     'Ballpark tour with Green Monster seats. Grabbing food after.', 5, '12:00', 'circle',
     'Fenway Bleacher Creatures'),
    ('aisha.k', 'Mugar Memorial Library', 'Group study for finals',
     'Booked a room on the 3rd floor, 6 seats.', 5, '18:00', 'circle', 'Mugar Study Buddies'),
    ('ryandoyle_', 'Green Dragon Tavern', 'Trivia night at the Green Dragon',
     'Need 2 more for our team. Bonus points if you know Sox history.', 5, '20:00', 'friends', None),
    ('iris.chen', 'Isabella Stewart Gardner Museum', 'Courtyard sketching afternoon',
     'Bring a sketchbook. Pencils only inside.', 6, '14:00', 'circle', 'Museum Free Nights'),
    ('dani.reyes', 'Fiyameta', "Dani's birthday drinks",
     'Come celebrate! Reservation under Reyes.', 6, '21:00', 'friends', None),
    ('sofia.alvarez', 'Tatte Bakery & Cafe | Beacon St', 'Brunch at Tatte',
     'Shakshuka for the table. The line moves fast if we get there early.', 7, '10:00', 'circle',
     'Sunday Brunch Club'),
    ('gracesully', 'Park Street Church', 'Walk the Common, then Park Street Church',
     'Slow loop around the Common and a look inside the church.', 7, '15:00', 'friends', None),
    ('maya.patel', 'Freedom Trail', 'Walk the whole Freedom Trail',
     '2.5 miles, 16 stops, one coffee break. Starting at the Common.', 8, '10:30', 'public', None),
    ('eligoldberg', 'Granary Burying Ground', 'Find the famous graves',
     'Hancock, Revere, Sam Adams. I made a map.', 9, '15:00', 'circle', 'Freedom Trail Walkers'),
    ('bellarusso', "Mike's Pastry", "Cannoli taste test: Mike's edition",
     'Ricotta vs. Nutella vs. pistachio. Ranking sheet provided.', 9, '16:00', 'circle',
     'North End Cannoli Crawl'),
    ('leomoreau', 'Boston Athenaeum', 'Athenaeum gallery visit',
     'The fifth-floor reading room alone is worth the trip.', 10, '13:30', 'public', None),
    ('tasha.b', 'Statue of Bill Russell', 'Photo walk around City Hall Plaza',
     'Golden hour shots. Any camera works, phones too.', 11, '15:45', 'public', None),
    ('jordan.lee', 'Faneuil Hall Marketplace', 'Holiday lights at Faneuil Hall',
     'Check out the tree and the lights, then hot chocolate.', 12, '18:00', 'friends', None),
    ('marcusbell', 'The Paul Revere House', 'Paul Revere House, then North End pizza',
     'Quick history fix and then the real reason we are there.', 13, '13:00', 'friends', None),
    ('zoe.adler', 'Isabella Stewart Gardner Museum', 'Evening at the Gardner',
     'Late hours and a concert in Calderwood Hall.', 14, '18:00', 'public', None),
    # Already happened
    ('jordan.lee', 'Pavement Coffeehouse - BU', 'Pre-hackathon brainstorm',
     'Coffee and whiteboard ideas before kickoff.', -1, '09:00', 'circle', 'BU Hack Squad'),
    ('tonydeluca', 'Union Oyster House', 'Chowder Sunday',
     'Cold day, hot chowder.', -3, '12:30', 'friends', None),
    ('sofia.alvarez', 'Tatte Bakery & Cafe | Beacon St', 'Brunch catch-up',
     'First brunch of the club!', -6, '11:00', 'circle', 'Sunday Brunch Club'),
    ('gina.eats', "Mike's Pastry", 'First cannoli crawl',
     "Mike's vs. the rest of Hanover Street.", -9, '15:00', 'circle', 'North End Cannoli Crawl'),
    ('diego_s', 'Faneuil Hall', 'Ranger talk in the Great Hall',
     'Park rangers give short talks every half hour.', -12, '14:00', 'public', None),
    ('wbriggs1775', 'The Paul Revere House', 'Revere House visit',
     'Oldest house downtown. Then lunch nearby.', -14, '11:00', 'circle', 'Freedom Trail Walkers'),
    ('iris.chen', 'Isabella Stewart Gardner Museum', 'First Gardner visit',
     'Finally going. Who is in?', -20, '13:00', 'public', None),
    ('priya_r', 'Boston Public Library', 'Midterm study marathon',
     'All day in Bates Hall. Lunch at noon.', -24, '10:00', 'friends', None),
    ('kmccarthy', 'Fenway Park', 'Last home game of the season',
     'Bleachers, section 40. See you there.', -55, '19:10', 'friends', None),
]

ADJECTIVES = ['Sunny', 'Brave', 'Quiet', 'Lucky', 'Rapid', 'Golden', 'Salty', 'Witty', 'Cozy', 'Bright',
              'Swift', 'Mellow', 'Bold', 'Clever', 'Chilly', 'Breezy']
NOUNS = ['Harbor', 'Cannoli', 'Trolley', 'Lantern', 'Beacon', 'Clam', 'Swan', 'Common', 'Brick', 'Pier',
         'Lobster', 'Steeple', 'Sparrow', 'Bridge', 'Compass', 'Chowder']


class Command(BaseCommand):
    help = 'Seed demo users, friendships, circles, saved places, interest and activities.'

    def add_arguments(self, parser):
        parser.add_argument('--csv', default=str(Path(settings.BASE_DIR) / 'demo_logins.csv'),
                            help='Where to write the demo logins (default: demo_logins.csv next to manage.py).')

    def handle(self, *args, **opts):
        self.rng = random.Random(SEED)
        self.now = timezone.now()

        places = self._load_places()
        if len(places) < 8:
            self.stderr.write(self.style.ERROR(
                f'Only {len(places)} of the demo places are in the database. Run `manage.py warm_cache` first.'))
            return

        with transaction.atomic():
            self._delete_old_users()
            users, passwords = self._create_users()
            self._create_friendships(users)
            circles = self._create_circles(users)
            saved = self._create_saved_places(users, places, circles)
            self._create_interests(users, places, saved)
            self._create_activities(users, places, circles)

        self._write_csv(opts['csv'], users, passwords)
        self._summary(users)

    # --- Places -------------------------------------------------------------

    def _load_places(self):
        """name -> (Place, category). Prefers the row that already has a card, then Google over Wikipedia."""
        by_name = {}
        carded = set(PlaceCard.objects.values_list('place_id', flat=True))
        for name, category in PLACES:
            options = list(Place.objects.filter(name=name))
            if not options:
                self.stdout.write(self.style.WARNING(f'  skipping "{name}" (not in the database)'))
                continue
            options.sort(key=lambda p: (p.id not in carded, p.source != Place.SOURCE_GOOGLE, p.id))
            by_name[name] = (options[0], category)
        return by_name

    # --- Users --------------------------------------------------------------

    def _all_seed_users(self):
        for cluster, people in CLUSTERS.items():
            for username, first, last in people:
                yield cluster, username, first, last

    def _delete_old_users(self):
        names = [u for _, u, _, _ in self._all_seed_users()]
        deleted = 0
        for username in names:
            old = User.objects.filter(username__iexact=username)
            if old.exists():
                old.delete()
                deleted += 1
        if deleted:
            self.stdout.write(f'Removed {deleted} existing demo users (and their data).')

    def _create_users(self):
        users, passwords = {}, {}
        used = set()
        for cluster, username, first, last in self._all_seed_users():
            while True:
                pw = f'{self.rng.choice(ADJECTIVES)}{self.rng.choice(NOUNS)}{self.rng.randint(10, 99)}'
                if pw not in used:
                    used.add(pw)
                    break
            user = User.objects.create_user(username=username, password=pw, email=f'{username}@example.com',
                                            first_name=first, last_name=last)
            joined = self._ago(days=(100, 140) if username == HERO else (20, 130))
            last_login = self._ago(days=(0, 6), hours=(0, 23))
            User.objects.filter(pk=user.pk).update(date_joined=joined, last_login=last_login)
            user.date_joined = joined
            user.cluster = cluster
            users[username] = user
            passwords[username] = pw
        return users, passwords

    # --- Friendships --------------------------------------------------------

    def _create_friendships(self, users):
        names = list(users)
        accepted = set()

        def add(a, b):
            if a != b:
                accepted.add(frozenset((a, b)))

        for people in CLUSTERS.values():
            members = [u for u, _, _ in people]
            for i, a in enumerate(members):
                for b in members[i + 1:]:
                    if self.rng.random() < 0.65:
                        add(a, b)
        for owner, _, _, members in CIRCLES:  # only friends can be in a circle
            for m in members:
                add(owner, m)
        for name in CLUSTERS['bu']:
            add(HERO, name[0])
        for name in HERO_FRIENDS:
            add(HERO, name)
        for _ in range(30):  # cross-cluster friendships
            a, b = self.rng.sample(names, 2)
            if HERO not in (a, b) and users[a].cluster != users[b].cluster:
                add(a, b)
        # Keep the hero's pending requests pending.
        for name in HERO_INCOMING_REQUESTS + HERO_OUTGOING_REQUESTS:
            accepted.discard(frozenset((HERO, name)))

        for pair in sorted(accepted, key=sorted):
            a, b = self.rng.sample(sorted(pair), 2)
            self._friendship(users[a], users[b], Friendship.STATUS_ACCEPTED)

        for name in HERO_INCOMING_REQUESTS:
            self._friendship(users[name], users[HERO], Friendship.STATUS_PENDING, days=(0, 3))
        for name in HERO_OUTGOING_REQUESTS:
            self._friendship(users[HERO], users[name], Friendship.STATUS_PENDING, days=(0, 3))

        # Some other pending and declined requests between non-friends.
        taken = set(accepted) | {frozenset((HERO, n)) for n in HERO_INCOMING_REQUESTS + HERO_OUTGOING_REQUESTS}
        others = [n for n in names if n != HERO]
        made = {Friendship.STATUS_PENDING: 0, Friendship.STATUS_DECLINED: 0}
        while made[Friendship.STATUS_PENDING] < 12 or made[Friendship.STATUS_DECLINED] < 4:
            a, b = self.rng.sample(others, 2)
            if frozenset((a, b)) in taken:
                continue
            taken.add(frozenset((a, b)))
            status = (Friendship.STATUS_PENDING if made[Friendship.STATUS_PENDING] < 12
                      else Friendship.STATUS_DECLINED)
            self._friendship(users[a], users[b], status, days=(0, 20))
            made[status] += 1

    def _friendship(self, a, b, status, days=None):
        f = Friendship.objects.create(from_user=a, to_user=b, status=status)
        later_joined = max(a.date_joined, b.date_joined)
        if days:
            created = self._ago(days=days, hours=(0, 23))
        else:
            span = max((self.now - later_joined).days - 1, 1)
            created = later_joined + timedelta(days=self.rng.uniform(0, span))
        Friendship.objects.filter(pk=f.pk).update(created_at=max(created, later_joined))

    # --- Circles ------------------------------------------------------------

    def _create_circles(self, users):
        circles = {}
        for owner_name, name, description, members in CIRCLES:
            owner = users[owner_name]
            circle = Circle.objects.create(name=name, description=description, owner=owner)
            created = self._ago(days=(10, 45))
            Circle.objects.filter(pk=circle.pk).update(created_at=created)
            own = CircleMembership.objects.create(circle=circle, user=owner, role=CircleMembership.ROLE_OWNER)
            CircleMembership.objects.filter(pk=own.pk).update(joined_at=created)
            joined = created
            for m in members:
                assert are_friends(owner, users[m]), f'{m} must be a friend of {owner_name}'
                joined = min(joined + timedelta(hours=self.rng.uniform(1, 72)), self.now)
                ms = CircleMembership.objects.create(circle=circle, user=users[m])
                CircleMembership.objects.filter(pk=ms.pk).update(joined_at=joined)
            circles[name] = circle
        return circles

    # --- Saved places and tags ----------------------------------------------

    def _create_saved_places(self, users, places, circles):
        by_category = {}
        for name, (place, category) in places.items():
            by_category.setdefault(category, []).append(name)
        user_circles = {}
        for c in circles.values():
            for uid in c.memberships.values_list('user_id', flat=True):
                user_circles.setdefault(uid, []).append(c)

        saved = []
        for username, user in users.items():
            tastes = CLUSTER_TASTES[user.cluster]
            liked = [n for cat in tastes for n in by_category.get(cat, [])]
            rest = [n for n in places if n not in liked]
            count = 11 if username == HERO else self.rng.randint(4, 11)
            picks = []
            for _ in range(count):
                pool = liked if (self.rng.random() < 0.75 and liked) else rest
                pool = [n for n in pool if n not in picks] or [n for n in places if n not in picks]
                if not pool:
                    break
                picks.append(self.rng.choice(pool))

            tags = {}
            for name in picks:
                place, category = places[name]
                visited = self.rng.random() < 0.45
                visibility = self.rng.choices(
                    [Visibility.FRIENDS, Visibility.PUBLIC, Visibility.PRIVATE, Visibility.CIRCLE],
                    weights=[50, 25, 13, 12])[0]
                circle = None
                if visibility == Visibility.CIRCLE:
                    if user_circles.get(user.pk):
                        circle = self.rng.choice(user_circles[user.pk])
                    else:
                        visibility = Visibility.FRIENDS
                sp = SavedPlace.objects.create(
                    user=user, place=place, visited=visited,
                    visited_at=self._ago(days=(1, 200)).date() if visited else None,
                    note=self.rng.choice(CATEGORY_NOTES[category]) if self.rng.random() < 0.4 else '',
                    visibility=visibility, circle=circle)
                created = self._since(user.date_joined)
                SavedPlace.objects.filter(pk=sp.pk).update(created_at=created)
                sp.seed_created = created

                for tag_name in self.rng.sample(CATEGORY_TAGS[category], k=self.rng.choice([0, 1, 1, 2])):
                    if tag_name not in tags:
                        tags[tag_name] = Tag.objects.create(owner=user, name=tag_name)
                        Tag.objects.filter(pk=tags[tag_name].pk).update(created_at=created)
                    sp.tags.add(tags[tag_name])
                saved.append(sp)
        return saved

    # --- Place interest -----------------------------------------------------

    def _create_interests(self, users, places, saved):
        saved_by_id = {sp.pk: sp for sp in saved}
        own_places = {}
        for sp in saved:
            own_places.setdefault(sp.user_id, set()).add(sp.place_id)

        for username, user in users.items():
            mine = own_places.get(user.pk, set())
            taken = set()
            # From friends' saved places I can see.
            visible_ids = visible_saved_places(user).exclude(user=user).filter(pk__in=list(saved_by_id))
            visible = [saved_by_id[pk] for pk in sorted(visible_ids.values_list('pk', flat=True))]
            self.rng.shuffle(visible)
            for sp in visible[:self.rng.randint(2, 6)]:
                if sp.place_id in taken or sp.place_id in mine:
                    continue
                self._interest(user, sp.place, via=sp, after=max(sp.seed_created, user.date_joined))
                taken.add(sp.place_id)
            # Plus a couple of places they found on their own (including unvisited saves).
            pool = [p for p, _ in places.values() if p.pk not in taken]
            for place in self.rng.sample(pool, k=min(len(pool), self.rng.randint(1, 3))):
                self._interest(user, place, after=user.date_joined)
                taken.add(place.pk)

    def _interest(self, user, place, via=None, after=None):
        pi = PlaceInterest.objects.create(user=user, place=place, via_saved_place=via)
        PlaceInterest.objects.filter(pk=pi.pk).update(created_at=self._since(after))

    # --- Activities ---------------------------------------------------------

    def _create_activities(self, users, places, circles):
        activities = []
        today = timezone.localdate()
        for author, place_name, title, desc, days, hhmm, visibility, circle_name in ACTIVITIES:
            if place_name not in places:
                continue
            hour, minute = (int(x) for x in hhmm.split(':'))
            starts_at = timezone.make_aware(datetime.combine(today + timedelta(days=days), time(hour, minute)))
            activity = Activity.objects.create(
                author=users[author], place=places[place_name][0], title=title, description=desc,
                starts_at=starts_at, visibility=visibility,
                circle=circles[circle_name] if circle_name else None)
            lead = timedelta(days=self.rng.uniform(1, 8), hours=self.rng.uniform(0, 12))
            created = max(min(starts_at - lead, self.now - timedelta(hours=self.rng.uniform(1, 30))),
                          users[author].date_joined)
            Activity.objects.filter(pk=activity.pk).update(created_at=created)
            activity.seed_created = created
            activities.append(activity)

        # Replies from everyone who can see each activity.
        visible = {u.pk: set(visible_activities(u).values_list('pk', flat=True)) for u in users.values()}
        for activity in activities:
            past = activity.starts_at < self.now
            in_circle = activity.visibility == Visibility.CIRCLE
            rate = 0.75 if in_circle else (0.3 if activity.visibility == Visibility.PUBLIC else 0.45)
            for user in users.values():
                if user.pk == activity.author_id or activity.pk not in visible[user.pk]:
                    continue
                if user.username == HERO and not past:
                    continue  # leave the hero's upcoming replies for the live demo
                if self.rng.random() > rate:
                    continue
                going_odds = 0.65 if (past or in_circle) else 0.4
                status = (ActivityResponse.STATUS_GOING if self.rng.random() < going_odds
                          else ActivityResponse.STATUS_INTERESTED)
                r = ActivityResponse.objects.create(activity=activity, user=user, status=status)
                at = activity.seed_created + (min(activity.starts_at, self.now) - activity.seed_created) \
                    * self.rng.uniform(0.05, 0.95)
                ActivityResponse.objects.filter(pk=r.pk).update(created_at=at, updated_at=at)

    # --- Output -------------------------------------------------------------

    def _write_csv(self, path, users, passwords):
        circle_counts = {}
        for c in Circle.objects.filter(memberships__user__in=users.values()).values_list('memberships__user'):
            circle_counts[c[0]] = circle_counts.get(c[0], 0) + 1
        path = Path(path)
        with path.open('w', newline='') as f:
            w = csv.writer(f)
            w.writerow(['username', 'password', 'first_name', 'last_name', 'email', 'group',
                        'friends', 'circles', 'saved_places', 'notes'])
            for username, user in users.items():
                friends = Friendship.objects.filter(status=Friendship.STATUS_ACCEPTED).filter(
                    from_user=user).count() + Friendship.objects.filter(
                    status=Friendship.STATUS_ACCEPTED, to_user=user).count()
                notes = ''
                if username == HERO:
                    notes = ('Main demo account: most friends and circles, 3 pending friend requests, '
                             "upcoming activities left unanswered so you can reply live")
                w.writerow([username, passwords[username], user.first_name, user.last_name, user.email,
                            user.cluster, friends, circle_counts.get(user.pk, 0),
                            SavedPlace.objects.filter(user=user).count(), notes])
        self.stdout.write(f'Wrote {len(users)} logins to {path}')

    def _summary(self, users):
        ids = [u.pk for u in users.values()]
        rows = [
            ('users', len(ids)),
            ('friendships (accepted)', Friendship.objects.filter(from_user__in=ids, status='accepted').count()),
            ('friend requests (pending)', Friendship.objects.filter(from_user__in=ids, status='pending').count()),
            ('circles', Circle.objects.filter(owner__in=ids).count()),
            ('saved places', SavedPlace.objects.filter(user__in=ids).count()),
            ('tags', Tag.objects.filter(owner__in=ids).count()),
            ('place interests', PlaceInterest.objects.filter(user__in=ids).count()),
            ('activities', Activity.objects.filter(author__in=ids).count()),
            ('activity replies', ActivityResponse.objects.filter(user__in=ids).count()),
        ]
        for label, n in rows:
            self.stdout.write(f'  {label}: {n}')
        self.stdout.write(self.style.SUCCESS(f'Demo data ready. Log in as "{HERO}" (password in the CSV).'))

    # --- Time helpers -------------------------------------------------------

    def _ago(self, days=(0, 0), hours=(0, 0)):
        return self.now - timedelta(days=self.rng.uniform(*days), hours=self.rng.uniform(*hours))

    def _since(self, start):
        """A random moment between `start` and now."""
        start = min(start, self.now)
        return start + (self.now - start) * self.rng.uniform(0.05, 1.0)
