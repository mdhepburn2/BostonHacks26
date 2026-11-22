import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { PersonRow } from '@/components/person-row';
import { RetryButton } from '@/components/retry-button';
import { ScanButton } from '@/components/scan-button';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { SearchResultRow } from '@/components/search-result-row';
import { SegmentedControl } from '@/components/segmented-control';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useLocation } from '@/hooks/use-location';
import { useAuth } from '@/hooks/use-auth';
import { usePeopleSearch } from '@/hooks/use-people-search';
import { usePlaceSearch } from '@/hooks/use-place-search';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'places' | 'people';

const MODES = [
  { value: 'places', label: 'Places' },
  { value: 'people', label: 'People' },
] as const;

export default function SearchScreen() {
  // Other screens can open a mode directly, e.g. Home's "Find friends" → ?mode=people.
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'people' ? 'people' : 'places');
  const [seenParam, setSeenParam] = useState(params.mode);
  if (params.mode !== seenParam) {
    setSeenParam(params.mode);
    if (params.mode === 'places' || params.mode === 'people') setMode(params.mode);
  }
  // Live here so each query survives switching modes and back.
  const [placeQuery, setPlaceQuery] = useState('');
  const [peopleQuery, setPeopleQuery] = useState('');

  return (
    <Screen title="Search" subtitle="Find places and people">
      <ScanButton variant="compact" />
      <SegmentedControl options={MODES} value={mode} onChange={setMode} />
      {mode === 'places' ? (
        <PlacesSearch query={placeQuery} onChangeQuery={setPlaceQuery} />
      ) : (
        <PeopleSearch query={peopleQuery} onChangeQuery={setPeopleQuery} />
      )}
    </Screen>
  );
}

function PlacesSearch({
  query,
  onChangeQuery,
}: {
  query: string;
  onChangeQuery: (query: string) => void;
}) {
  const theme = useTheme();
  // Only used if location is already allowed (Scan asks for it); Search never prompts.
  const { coords } = useLocation();
  const search = usePlaceSearch(query, coords);

  let body;
  if (search.idle) {
    body = (
      <EmptyState
        accent="blue"
        icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
        title="Look up a place"
        body="Type the name of somewhere in Boston, like Faneuil Hall or the Public Garden."
      />
    );
  } else if (search.error) {
    body =
      search.error.kind === 'bad_request' ? (
        <EmptyState
          icon={{ ios: 'exclamationmark.circle', android: 'error', web: 'error' }}
          title="Couldn't search for that"
          body={search.error.message}
        />
      ) : (
        <EmptyState
          icon={{ ios: 'wifi.exclamationmark', android: 'wifi_off', web: 'wifi_off' }}
          title="Search isn't working right now"
          body={search.error.message}
          action={<RetryButton onPress={search.retry} />}
        />
      );
  } else if (search.results.length) {
    body = (
      <View style={[styles.results, search.loading && styles.refreshing]}>
        {search.results.map((place) => (
          <SearchResultRow key={place.id} place={place} />
        ))}
      </View>
    );
  } else if (search.loading) {
    body = (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          Searching...
        </ThemedText>
      </View>
    );
  } else {
    body = (
      <EmptyState
        icon={{ ios: 'mappin.slash', android: 'location_off', web: 'location_off' }}
        title={`No places match "${search.resultsFor}"`}
        body="Check the spelling, or try a shorter name."
      />
    );
  }

  return (
    <>
      <SearchField value={query} onChangeText={onChangeQuery} placeholder="Search places" />
      {body}
    </>
  );
}

/** Find people by username; each result opens their profile (where you can add them). */
function PeopleSearch({
  query,
  onChangeQuery,
}: {
  query: string;
  onChangeQuery: (query: string) => void;
}) {
  const { status } = useAuth();

  if (status !== 'signedIn') {
    return status === 'signedOut' ? (
      <SignInPrompt
        accent="green"
        icon={{ ios: 'person.2', android: 'group', web: 'group' }}
        title="Log in to find friends"
        body="Search people by username, see the places they share, and send friend requests."
      />
    ) : null;
  }

  return <PeopleResults query={query} onChangeQuery={onChangeQuery} />;
}

function PeopleResults({
  query,
  onChangeQuery,
}: {
  query: string;
  onChangeQuery: (query: string) => void;
}) {
  const theme = useTheme();
  const search = usePeopleSearch(query);

  let body;
  if (search.idle) {
    body = (
      <EmptyState
        accent="green"
        icon={{ ios: 'person.2', android: 'group', web: 'group' }}
        title="Find your friends"
        body="Search by username to see the places they share and send a friend request."
      />
    );
  } else if (search.error) {
    body = (
      <EmptyState
        icon={{ ios: 'wifi.exclamationmark', android: 'wifi_off', web: 'wifi_off' }}
        title="Search isn't working right now"
        body={search.error.message}
        action={<RetryButton onPress={search.retry} />}
      />
    );
  } else if (search.results.length) {
    body = (
      <View style={[styles.results, search.loading && styles.refreshing]}>
        {search.results.map((person) => (
          <PersonRow key={person.id} user={person} friendship={person.friendship} />
        ))}
      </View>
    );
  } else if (search.loading) {
    body = (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          Searching...
        </ThemedText>
      </View>
    );
  } else {
    body = (
      <EmptyState
        icon={{ ios: 'person.fill.questionmark', android: 'person_search', web: 'person_search' }}
        title={`No one called "${search.resultsFor}"`}
        body="Check the spelling, or try part of their username."
      />
    );
  }

  return (
    <>
      <SearchField value={query} onChangeText={onChangeQuery} placeholder="Search people" />
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  results: {
    gap: Spacing.two,
  },
  // Keep the old results on screen while the next query loads, just dimmed.
  refreshing: {
    opacity: 0.5,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
});
