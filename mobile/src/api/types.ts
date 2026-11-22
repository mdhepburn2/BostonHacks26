/** Types that mirror the API contract (see CLAUDE.md, "Talking to the API"). */

export type NearestT = {
  stop: string;
  lines: string[];
  walk_min: number;
};

export type SavedInfo = {
  id: number;
  visited: boolean;
  visited_at: string | null;
};

/** GET /api/places/<id>/ */
export type PlaceDetail = {
  id: number;
  name: string;
  bio: string;
  rating: number | null;
  rating_count: number | null;
  price_range: string | null;
  hours: string[] | null;
  nearest_t: NearestT | null;
  friends_interested: number;
  saved: SavedInfo | null;
};

/** The short place shape used inside lists. */
export type PlaceSummary = {
  id: number;
  name: string;
  lat: number;
  lng: number;
};

export type Visibility = 'private' | 'friends' | 'circle' | 'public';

export type Tag = {
  id: number;
  name: string;
};

/** One item from GET /api/saved/ */
export type SavedPlace = {
  id: number;
  place: PlaceSummary;
  visited: boolean;
  visited_at: string | null;
  note: string;
  visibility: Visibility;
  circle_id: number | null;
  tags: Tag[];
  created_at: string;
};
