import { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { RetryButton } from '@/components/retry-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { RequestState } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';

type LoadableProps<T> = {
  state: RequestState<T>;
  /** e.g. "Loading saved places..." */
  loadingLabel: string;
  /** e.g. "Couldn't load your saved places" */
  errorTitle: string;
  children: (data: T) => ReactNode;
};

/** Shows a spinner while loading, an error with "Try again" on failure, else `children(data)`. */
export function Loadable<T>({ state, loadingLabel, errorTitle, children }: LoadableProps<T>) {
  const theme = useTheme();

  if (state.data !== null) return children(state.data);

  if (state.error) {
    return (
      <EmptyState
        icon={{ ios: 'wifi.exclamationmark', android: 'wifi_off', web: 'wifi_off' }}
        title={errorTitle}
        body={state.error.message}
        action={<RetryButton onPress={state.retry} />}
      />
    );
  }

  return (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary">
        {loadingLabel}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
});
