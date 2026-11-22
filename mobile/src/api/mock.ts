import type { PlaceDetail, PlaceSummary, SavedPlace } from '@/api/types';

/*
 * MOCK data so the Home, Saved and place card designs can be seen before the API client
 * exists. Replace each export with a real call when its build step lands (place card:
 * step 4, saved: step 11, friends feed: step 17), then delete this file.
 */

const PLACES: (PlaceSummary & Partial<PlaceDetail>)[] = [
  {
    id: 1,
    name: 'Faneuil Hall Marketplace',
    lat: 42.3600,
    lng: -71.0545,
    bio: 'A market hall since 1743, with food stalls in Quincy Market, street performers out front and plenty of places to sit and people-watch.',
    rating: 4.5,
    rating_count: 51203,
    price_range: '$$',
    nearest_t: { stop: 'Government Center', lines: ['Green', 'Blue'], walk_min: 4 },
  },
  {
    id: 2,
    name: 'Boston Public Library',
    lat: 42.3493,
    lng: -71.0782,
    bio: 'The grand Central Library in Copley Square. Look up in Bates Hall, then find a seat in the courtyard.',
    rating: 4.8,
    rating_count: 8714,
    price_range: null,
    nearest_t: { stop: 'Copley', lines: ['Green'], walk_min: 2 },
  },
  {
    id: 3,
    name: 'Public Garden',
    lat: 42.3541,
    lng: -71.0704,
    bio: 'Swan boats, the Make Way for Ducklings statues and a lagoon bridge that is the best photo spot in town.',
    rating: 4.8,
    rating_count: 23950,
    price_range: null,
    hours: null,
    nearest_t: { stop: 'Arlington', lines: ['Green'], walk_min: 3 },
  },
  {
    id: 4,
    name: "Mike's Pastry",
    lat: 42.3638,
    lng: -71.0542,
    bio: 'North End bakery famous for its cannoli and the white-and-blue boxes you will see all over the neighbourhood.',
    rating: 4.4,
    rating_count: 18230,
    price_range: '$',
    nearest_t: { stop: 'Haymarket', lines: ['Orange', 'Green'], walk_min: 6 },
  },
  {
    id: 5,
    name: 'Museum of Fine Arts',
    lat: 42.3394,
    lng: -71.0940,
    bio: 'One of the biggest art museums in the country, from ancient Egypt to contemporary work.',
    rating: 4.8,
    rating_count: 16422,
    price_range: '$$',
    nearest_t: { stop: 'Museum of Fine Arts', lines: ['Green Line E'], walk_min: 1 },
  },
  {
    id: 6,
    name: 'Old North Church',
    lat: 42.3663,
    lng: -71.0544,
    bio: 'Boston’s oldest standing church, where the "one if by land, two if by sea" lanterns were hung.',
    rating: 4.7,
    rating_count: 6120,
    price_range: '$',
    nearest_t: { stop: 'Haymarket', lines: ['Orange', 'Green'], walk_min: 9 },
  },
];

const HOURS = [
  'Monday: 10:00 AM - 9:00 PM',
  'Tuesday: 10:00 AM - 9:00 PM',
  'Wednesday: 10:00 AM - 9:00 PM',
  'Thursday: 10:00 AM - 9:00 PM',
  'Friday: 10:00 AM - 9:00 PM',
  'Saturday: 10:00 AM - 9:00 PM',
  'Sunday: 11:00 AM - 7:00 PM',
];

function summary(id: number): PlaceSummary {
  const { name, lat, lng } = PLACES.find((p) => p.id === id) ?? PLACES[0];
  return { id, name, lat, lng };
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

/** MOCK for GET /api/places/<id>/ */
export function samplePlace(id: number): PlaceDetail {
  const place = PLACES.find((p) => p.id === id) ?? PLACES[0];
  return {
    bio: '',
    rating: null,
    rating_count: null,
    price_range: null,
    hours: HOURS,
    nearest_t: null,
    ...place,
    id,
    friends_interested: id % 4,
    saved: null,
  };
}

/** MOCK for GET /api/saved/ (newest first). */
export function sampleSavedPlaces(): SavedPlace[] {
  const saved = (
    id: number,
    placeId: number,
    created: number,
    extra: Partial<SavedPlace>,
  ): SavedPlace => ({
    id,
    place: summary(placeId),
    visited: false,
    visited_at: null,
    note: '',
    visibility: 'friends',
    circle_id: null,
    tags: [],
    created_at: hoursAgo(created),
    ...extra,
  });

  return [
    saved(101, 1, 3, { tags: [{ id: 1, name: 'Food' }] }),
    saved(102, 2, 20, {
      visited: true,
      visited_at: '2026-11-15',
      visibility: 'public',
      tags: [{ id: 2, name: 'Rainy day' }],
    }),
    saved(103, 5, 48, { visibility: 'private', tags: [{ id: 3, name: 'Art' }] }),
    saved(104, 3, 96, {
      visited: true,
      visited_at: '2026-11-02',
      tags: [
        { id: 4, name: 'Outdoors' },
        { id: 5, name: 'Date idea' },
      ],
    }),
    saved(105, 6, 170, {}),
  ];
}

/** MOCK: no feed endpoint exists yet (see CLAUDE.md, "Open API questions"). */
export type MockFeedItem = {
  friend: { id: number; username: string };
  saved: SavedPlace;
};

export function sampleFriendsFeed(): MockFeedItem[] {
  const item = (
    friendId: number,
    username: string,
    placeId: number,
    created: number,
    visitedAt: string | null,
  ): MockFeedItem => ({
    friend: { id: friendId, username },
    saved: {
      id: 200 + friendId,
      place: summary(placeId),
      visited: visitedAt !== null,
      visited_at: visitedAt,
      note: '',
      visibility: 'friends',
      circle_id: null,
      tags: [],
      created_at: hoursAgo(created),
    },
  });

  return [
    item(1, 'alex', 4, 1, '2026-11-20'),
    item(2, 'riley', 6, 5, null),
    item(3, 'sam', 3, 30, '2026-11-19'),
  ];
}
