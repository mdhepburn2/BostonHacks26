import { type ReactNode } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenProps = {
  /** Large title at the top. Leave out when the stack header already names the screen. */
  title?: string;
  subtitle?: string;
  /** Pass both to turn on pull to refresh. */
  refreshing?: boolean;
  onRefresh?: () => void;
  children?: ReactNode;
};

/**
 * Scrollable tab screen with a large title. The ScrollView is the root so the
 * native tab bar's tap-to-scroll-to-top works.
 */
export function Screen({ title, subtitle, refreshing, onRefresh, children }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // iOS adjusts for the status bar and tab bar itself; elsewhere pad by hand.
  const padding =
    Platform.OS === 'ios'
      ? undefined
      : { paddingTop: insets.top + Spacing.three, paddingBottom: insets.bottom + BottomTabInset };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      // Tapping a search result should open it, not just dismiss the keyboard.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing ?? false}
            onRefresh={onRefresh}
            tintColor={theme.textSecondary}
          />
        ) : undefined
      }
      contentContainerStyle={[styles.content, padding]}>
      {title ? (
        <View style={styles.header}>
          <ThemedText type="title">{title}</ThemedText>
          {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    gap: Spacing.one,
    paddingTop: Spacing.three,
  },
});
