import { StyleSheet, View } from 'react-native';

import { sampleSavedPlaces } from '@/api/mock';
import { EmptyState } from '@/components/empty-state';
import { PlaceTile } from '@/components/place-tile';
import { Screen } from '@/components/screen';
import { SignChip } from '@/components/sign-chip';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// MOCK: sample data until step 11 loads GET /api/saved/.
const SAVED = sampleSavedPlaces();

export default function SavedScreen() {
  const theme = useTheme();
  const visited = SAVED.filter((saved) => saved.visited).length;

  return (
    <Screen title="Saved" subtitle="Places you want to go, and places you've been">
      {SAVED.length ? (
        <>
          <View style={styles.counts}>
            <SignChip label={`${SAVED.length} saved`} background={theme.text} color={theme.background} />
            <SignChip
              label={`${visited} visited`}
              background={theme.green}
              color={theme.onGreen}
              icon={{ ios: 'checkmark', android: 'check', web: 'check' }}
            />
            <SignChip
              label={`${SAVED.length - visited} to go`}
              background={theme.yellow}
              color={theme.onYellow}
              icon={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }}
            />
          </View>
          <View style={styles.list}>
            {SAVED.map((saved) => (
              <PlaceTile key={saved.id} place={saved.place} saved={saved} showVisibility />
            ))}
          </View>
        </>
      ) : (
        <EmptyState
          accent="tint"
          icon={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
          title="No saved places yet"
          body="Saved places show up here. You'll be able to filter them, check off the ones you've visited, and choose who can see each one."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  counts: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.three,
  },
});
