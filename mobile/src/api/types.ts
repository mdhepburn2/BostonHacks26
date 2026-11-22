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
  /** Whether I've marked interest. Always false when logged out. */
  interested: boolean;
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

/** The place inside a saved place. price_range is only known once its card has been opened. */
export type SavedPlaceSummary = PlaceSummary & {
  price_range: string | null;
  /** Google place types, e.g. "restaurant", "museum". Empty for Wikipedia-only places. */
  types: string[];
};

/** One item from GET /api/saved/ (and /api/users/<id>/saved/, /api/feed/) */
export type SavedPlace = {
  id: number;
  place: SavedPlaceSummary;
  visited: boolean;
  visited_at: string | null;
  note: string;
  visibility: Visibility;
  circle_id: number | null;
  tags: Tag[];
  created_at: string;
};

/** One result from GET /api/places/search/ */
export type SearchResult = PlaceSummary & {
  address: string;
};

/** GET /api/places/search/?q=&lat=&lng= */
export type SearchResponse = {
  results: SearchResult[];
};

export type IdentifyStatus = 'matched' | 'ambiguous' | 'not_found';

/** POST /api/identify/ */
export type IdentifyResponse = {
  status: IdentifyStatus;
  /** null unless status is matched or ambiguous. */
  place: PlaceSummary | null;
  candidates: PlaceSummary[];
  confidence: number;
};

// --- Accounts (Phase 2) ----------------------------------------------------

/** GET /api/me/, and the `user` in the login / register response. */
export type User = {
  id: number;
  username: string;
  email: string;
};

/** POST /api/auth/login/ and /api/auth/register/ */
export type AuthResponse = {
  token: string;
  user: User;
};

/** GET /api/saved/ */
export type SavedListResponse = {
  results: SavedPlace[];
};

// --- Social (Phase 3) -------------------------------------------------------

export type UserSummary = {
  id: number;
  username: string;
};

/** From my side of the friendship. */
export type Friendship = 'self' | 'friends' | 'request_sent' | 'request_received' | 'none';

/** GET /api/users/<id>/ */
export type Profile = UserSummary & {
  friendship: Friendship;
  /** saved / visited only count what I'm allowed to see (everything on my own profile). */
  counts: { friends: number; saved: number; visited: number };
};

/** One item from GET /api/feed/ */
export type FeedItem = {
  friend: UserSummary;
  saved: SavedPlace;
  /** The later of when it was saved and when it was marked visited. */
  feed_at: string;
};

/** GET /api/feed/ */
export type FeedResponse = {
  results: FeedItem[];
};
