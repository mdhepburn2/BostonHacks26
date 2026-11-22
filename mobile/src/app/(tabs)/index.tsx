import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getSaved } from '@/api/saved';
import { getFeed } from '@/api/social';
import { Button } from '@/components/button';
import { Crosswalk } from '@/components/crosswalk';
import { EmptyState } from '@/components/empty-state';
import { FriendFeedItem } from '@/components/friend-feed-item';
import { Loadable } from '@/components/loadable';
import { PlaceTile } from '@/components/place-tile';
import { ScanButton } from '@/components/scan-button';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRequest } from '@/hooks/use-request';

const RECENT_COUNT = 5;
const FEED_COUNT = 20;

export default function HomeScreen() {
  const { status, user } = useAuth();
  const signedIn = status === 'signedIn' && user !== null;

  return (
    <Screen title="Home" subtitle="Explore Boston on foot">
      <ScanButton />
      <Crosswalk />
      {signedIn ? (
        <SignedInHome userId={user.id} />
      ) : status === 'signedOut' ? (
        <SignInPrompt
          accent="yellow"
          icon={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
          title="Log in to save places"
          body="Keep a list of places to go, check them off, and see what your friends are saving."
        />
      ) : null}
    </Screen>
  );
}

function SignedInHome({ userId }: { userId: number }) {
  const recent = useRequest(`home-saved:${userId}`, () => getSaved());
  const feed = useRequest(`home-feed:${userId}`, () => getFeed(FEED_COUNT));

  return (
    <>
      <Section title="Recently saved" accent="yellow">
        <Loadable
          state={recent}
          loadingLabel="Loading your places..."
          errorTitle="Couldn't load your saved places">
          {({ results }) =>
            results.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.bleed}
                contentContainerStyle={styles.recentRow}>
                {results.slice(0, RECENT_COUNT).map((saved) => (
                  <PlaceTile key={saved.id} variant="tile" place={saved.place} saved={saved} />
                ))}
              </ScrollView>
            ) : (
              <EmptyState
                accent="yellow"
                icon={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
                title="Save your first place"
                body="Scan something nearby or search for a place you've heard about."
                action={<Button label="Search places" onPress={() => router.push('/search')} />}
              />
            )
          }
        </Loadable>
      </Section>

      <Section title="From friends" accent="blue">
        <Loadable
          state={feed}
          loadingLabel="Loading your friends' places..."
          errorTitle="Couldn't load the friends feed">
          {({ results }) =>
            results.length ? (
              <View style={styles.feed}>
                {results.map((item) => (
                  <FriendFeedItem key={item.saved.id} item={item} />
                ))}
              </View>
            ) : (
              <EmptyState
                accent="blue"
                icon={{ ios: 'person.2', android: 'group', web: 'group' }}
                title="Nothing from friends yet"
                body="Add friends to see the places they're saving and visiting."
              />
            )
          }
        </Loadable>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  // Let the row scroll edge to edge instead of being clipped by the screen padding.
  bleed: {
    marginHorizontal: -Spacing.three,
  },
  recentRow: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  feed: {
    gap: Spacing.four,
  },
});
