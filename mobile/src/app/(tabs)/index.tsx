import { ScrollView, StyleSheet, View } from 'react-native';

import { sampleFriendsFeed, sampleSavedPlaces } from '@/api/mock';
import { Crosswalk } from '@/components/crosswalk';
import { EmptyState } from '@/components/empty-state';
import { FriendFeedItem } from '@/components/friend-feed-item';
import { PlaceTile } from '@/components/place-tile';
import { ScanButton } from '@/components/scan-button';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { Spacing } from '@/constants/theme';

// MOCK: sample data until saved places (step 12) and the friends feed (step 17) are wired up.
const RECENT = sampleSavedPlaces().slice(0, 5);
const FEED = sampleFriendsFeed();

export default function HomeScreen() {
  return (
    <Screen title="Home" subtitle="Explore Boston on foot">
      <ScanButton />
      <Crosswalk />

      <Section title="Recently saved" accent="yellow">
        {RECENT.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.bleed}
            contentContainerStyle={styles.recentRow}>
            {RECENT.map((saved) => (
              <PlaceTile key={saved.id} variant="tile" place={saved.place} saved={saved} />
            ))}
          </ScrollView>
        ) : (
          <EmptyState
            accent="yellow"
            icon={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
            title="Save your first place"
            body="Scan something nearby or search for a place you've heard about."
          />
        )}
      </Section>

      <Section title="From friends" accent="blue">
        {FEED.length ? (
          <View style={styles.feed}>
            {FEED.map((item) => (
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
        )}
      </Section>
    </Screen>
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
