import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import type { PlaceDetail, SavedInfo } from '@/api/types';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { InterestButton, useInterest, type InterestVia } from '@/components/interest-button';
import { PlaceCard } from '@/components/place-card';
import { RetryButton } from '@/components/retry-button';
import { SavePanel } from '@/components/save-panel';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { usePlace } from '@/hooks/use-place';
import { useTheme } from '@/hooks/use-theme';

export default function PlaceScreen() {
  // `via` / `from`: opened from a friend's saved place (Home feed or their profile).
  const { id, via, from } = useLocalSearchParams<{ id: string; via?: string; from?: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const { loading, data: place, error, retry } = usePlace(id);
  const viaId = Number(via);
  const interestVia: InterestVia | undefined =
    via && Number.isInteger(viaId) && from ? { savedPlaceId: viaId, friend: from } : undefined;

  let body;
  if (place) {
    // Remount on login / logout so the panels start from the reloaded card.
    body = <LoadedPlace key={`${place.id}:${user?.id ?? 'guest'}`} place={place} via={interestVia} />;
  } else if (loading) {
    body = (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          Loading place...
        </ThemedText>
      </View>
    );
  } else if (error?.kind === 'not_found') {
    body = (
      <EmptyState
        icon={{ ios: 'mappin.slash', android: 'location_off', web: 'location_off' }}
        title="Place not found"
        body="It may have been removed, or it isn't visible to you."
        action={<BackButton />}
      />
    );
  } else if (error?.kind === 'bad_request') {
    body = (
      <EmptyState
        icon={{ ios: 'exclamationmark.circle', android: 'error', web: 'error' }}
        title="Couldn't open this place"
        body={error.message}
        action={<BackButton />}
      />
    );
  } else {
    // 'unavailable' (5xx, timeout, offline). 'unauthorized' can't happen until Phase 2.
    body = (
      <EmptyState
        icon={{ ios: 'wifi.exclamationmark', android: 'wifi_off', web: 'wifi_off' }}
        title="Couldn't load this place"
        body={error?.message}
        action={<RetryButton onPress={retry} />}
      />
    );
  }

  return <Screen>{body}</Screen>;
}

function LoadedPlace({ place, via }: { place: PlaceDetail; via?: InterestVia }) {
  const interest = useInterest(place, via);
  const theme = useTheme();
  const { status } = useAuth();
  // Mirrors the Save panel, so the card's "Visited" chip follows it.
  const [saved, setSaved] = useState<SavedInfo | null>(place.saved);

  return (
    <PlaceCard
      place={place}
      saved={saved}
      actions={
        <SavePanel
          placeId={place.id}
          placeName={place.name}
          initial={place.saved}
          onChange={setSaved}
        />
      }
      friendsInterested={interest.friendsInterested}
      interestedFriends={interest.interestedFriends}
      interest={
        <View style={styles.interest}>
          <View style={styles.interestRow}>
            <InterestButton state={interest} />
            {via ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.via}>
                {'From '}
                <ThemedText type="smallBold">{via.friend}</ThemedText>
                {"'s saved places"}
              </ThemedText>
            ) : null}
          </View>
          {interest.error ? (
            <ThemedText type="small" style={{ color: theme.tint }} accessibilityLiveRegion="polite">
              {interest.error}
            </ThemedText>
          ) : null}
          {status === 'signedIn' ? (
            <View style={styles.plan}>
              <Button
                variant="plain"
                size="small"
                label="Make a plan here"
                onPress={() =>
                  router.push({
                    pathname: '/activities/new',
                    params: { placeId: String(place.id), placeName: place.name },
                  })
                }
              />
            </View>
          ) : null}
        </View>
      }
    />
  );
}

function BackButton() {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}>
      <ThemedText type="smallBold" style={{ color: theme.tint }}>
        Go back
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  interest: {
    gap: Spacing.two,
    marginTop: -Spacing.two,
  },
  interestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  via: {
    flex: 1,
  },
  plan: {
    alignItems: 'flex-start',
  },
  back: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
