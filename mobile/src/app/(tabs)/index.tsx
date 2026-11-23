import { router } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { getActivities } from '@/api/activities';
import { getSaved } from '@/api/saved';
import { getFeed } from '@/api/social';
import type { ActivitiesResponse, FeedResponse, SavedListResponse } from '@/api/types';
import { ActivityRow } from '@/components/activity-row';
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
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { type RequestState, useRefreshOnFocus, useRequest } from '@/hooks/use-request';
import { isPast } from '@/utils/dates';

const RECENT_COUNT = 5;
const FEED_COUNT = 20;
const PLANS_COUNT = 3;

export default function HomeScreen() {
  const { status, user } = useAuth();
  const signedIn = status === 'signedIn' && user !== null;
  const recent = useRequest(signedIn ? `home-saved:${user.id}` : null, () => getSaved());
  const feed = useRequest(signedIn ? `home-feed:${user.id}` : null, () => getFeed(FEED_COUNT));
  const plans = useRequest(signedIn ? `home-plans:${user.id}` : null, getActivities);
  const refresh = () => {
    recent.refresh();
    feed.refresh();
    plans.refresh();
  };
  useRefreshOnFocus(refresh);

  return (
    <Screen
      title="Home"
      subtitle="Explore Boston on foot"
      refreshing={recent.refreshing || feed.refreshing || plans.refreshing}
      onRefresh={signedIn ? refresh : undefined}>
      <ScanButton />
      <Crosswalk />
      {signedIn ? (
        <SignedInHome recent={recent} feed={feed} plans={plans} myId={user.id} />
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

type SignedInHomeProps = {
  recent: RequestState<SavedListResponse>;
  feed: RequestState<FeedResponse>;
  plans: RequestState<ActivitiesResponse>;
  myId: number;
};

function SignedInHome({ recent, feed, plans, myId }: SignedInHomeProps) {
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
                body={
                  Platform.OS === 'web'
                    ? "Search for a place you've heard about."
                    : "Scan something nearby or search for a place you've heard about."
                }
                action={<Button label="Search places" onPress={() => router.push('/search')} />}
              />
            )
          }
        </Loadable>
      </Section>

      <Section title="Coming up" accent="yellow">
        <Loadable state={plans} loadingLabel="Loading plans..." errorTitle="Couldn't load plans">
          {({ results }) => {
            const upcoming = results.filter((a) => !isPast(a.starts_at)).slice(0, PLANS_COUNT);
            return (
              <View style={styles.plans}>
                {upcoming.length ? (
                  upcoming.map((activity) => (
                    <ActivityRow key={activity.id} activity={activity} myId={myId} />
                  ))
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    No plans coming up. Pick a place and invite your friends.
                  </ThemedText>
                )}
                <View style={styles.planLinks}>
                  <Button
                    variant="plain"
                    size="small"
                    label="Plan something"
                    onPress={() => router.push('/activities/new')}
                  />
                  {results.length ? (
                    <Button
                      variant="plain"
                      size="small"
                      label="See all plans"
                      onPress={() => router.push('/activities')}
                    />
                  ) : null}
                </View>
              </View>
            );
          }}
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
                action={
                  <Button
                    label="Find friends"
                    onPress={() =>
                      router.navigate({ pathname: '/search', params: { mode: 'people' } })
                    }
                  />
                }
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
  plans: {
    gap: Spacing.two,
  },
  planLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
