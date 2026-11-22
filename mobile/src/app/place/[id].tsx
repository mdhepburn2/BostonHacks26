import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { PlaceCard } from '@/components/place-card';
import { RetryButton } from '@/components/retry-button';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { usePlace } from '@/hooks/use-place';
import { useTheme } from '@/hooks/use-theme';

export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { loading, data: place, error, retry } = usePlace(id);

  let body;
  if (place) {
    body = <PlaceCard place={place} />;
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
  back: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
