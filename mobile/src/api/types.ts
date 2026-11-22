/** Types that mirror the API contract (see CLAUDE.md, "Talking to the API"). */

export type NearestT = {
  stop: string;
  lines: string[];
  walk_min: number;
};

export type Visibility = 'private' | 'friends' | 'circle' | 'public';

/** `saved` on the place card: my own saved place for it. */
export type SavedInfo = {
  id: number;
  visited: boolean;
  /** "YYYY-MM-DD", or null when not visited. */
  visited_at: string | null;
  visibility: Visibility;
  circle_id: number | null;
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

/** One item from GET /api/circles/ (circles I own or belong to). */
export type Circle = {
  id: number;
  name: string;
  description: string;
  owner: UserSummary;
  members: (UserSummary & { role: 'owner' | 'member'; joined_at: string })[];
  created_at: string;
};

/** GET /api/circles/ */
export type CirclesResponse = {
  results: Circle[];
};

/** One result from GET /api/users/search/?q= */
export type UserSearchResult = UserSummary & {
  friendship: Friendship;
};

/** GET /api/users/search/?q= */
export type UserSearchResponse = {
  results: UserSearchResult[];
};

/** POST /api/friends/requests/ and the items of GET /api/friends/requests/ */
export type FriendRequest = {
  id: number;
  from_user: UserSummary;
  to_user: UserSummary;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
};

/** GET /api/friends/requests/: pending requests sent to me, newest first. */
export type FriendRequestsResponse = {
  results: FriendRequest[];
};

/** POST /api/places/<id>/interest/: the live state for the card's button and count. */
export type InterestResponse = {
  interested: true;
  /** The friend's saved place this interest came from, if any. */
  via_saved_place_id: number | null;
  friends_interested: number;
};

/** GET /api/friends/: my friends, A to Z. */
export type FriendsResponse = {
  results: UserSummary[];
};

/** Activities can't be private: there'd be no one to reply. */
export type ActivityVisibility = Exclude<Visibility, 'private'>;

export type ActivityReply = 'interested' | 'going';

/** One item from GET /api/activities/, and GET / POST / PATCH /api/activities/<id>/. */
export type Activity = {
  id: number;
  author: UserSummary;
  place: PlaceSummary;
  title: string;
  description: string;
  /** ISO datetime. */
  starts_at: string;
  visibility: ActivityVisibility;
  circle_id: number | null;
  /** Every reply, mine included. */
  counts: { interested: number; going: number };
  my_response: ActivityReply | null;
  /** Everyone who replied: going first, then interested, oldest reply first. */
  responses: { user: UserSummary; status: ActivityReply }[];
};

/** GET /api/activities/: upcoming soonest first, then past ones most recent first. */
export type ActivitiesResponse = {
  results: Activity[];
};
