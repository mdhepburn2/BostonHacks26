import { StyleSheet, View } from 'react-native';

import { getSaved } from '@/api/saved';
import type { SavedPlace } from '@/api/types';
import { EmptyState } from '@/components/empty-state';
import { Loadable } from '@/components/loadable';
import { PlaceTile } from '@/components/place-tile';
import { Screen } from '@/components/screen';
import { SignChip } from '@/components/sign-chip';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshOnFocus, useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';

// Step 11 adds search, filters (price, type, visited, visibility) and sorting on top of this.
export default function SavedScreen() {
  const { status, user } = useAuth();
  const saved = useRequest(user ? `saved:${user.id}` : null, () => getSaved());
  useRefreshOnFocus(saved.refresh);

  return (
    <Screen
      title="Saved"
      subtitle="Places you want to go, and places you've been"
      refreshing={saved.refreshing}
      onRefresh={user ? saved.refresh : undefined}>
      {user ? (
        <Loadable
          state={saved}
          loadingLabel="Loading saved places..."
          errorTitle="Couldn't load your saved places">
          {({ results }) => <SavedList saved={results} />}
        </Loadable>
      ) : status === 'signedOut' ? (
        <SignInPrompt
          icon={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
          title="Log in to see your saved places"
          body="Saved places show up here, with the ones you've visited checked off."
        />
      ) : null}
    </Screen>
  );
}

function SavedList({ saved }: { saved: SavedPlace[] }) {
  const theme = useTheme();
  const visited = saved.filter((item) => item.visited).length;

  if (!saved.length) {
    return (
      <EmptyState
        accent="tint"
        icon={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
        title="No saved places yet"
        body="Saved places show up here. You'll be able to filter them, check off the ones you've visited, and choose who can see each one."
      />
    );
  }

  return (
    <>
      <View style={styles.counts}>
        <SignChip label={`${saved.length} saved`} background={theme.text} color={theme.background} />
        <SignChip
          label={`${visited} visited`}
          background={theme.green}
          color={theme.onGreen}
          icon={{ ios: 'checkmark', android: 'check', web: 'check' }}
        />
        <SignChip
          label={`${saved.length - visited} to go`}
          background={theme.yellow}
          color={theme.onYellow}
          icon={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }}
        />
      </View>
      <View style={styles.list}>
        {saved.map((item) => (
          <PlaceTile key={item.id} place={item.place} saved={item} showVisibility />
        ))}
      </View>
    </>
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
