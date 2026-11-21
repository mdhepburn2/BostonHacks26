import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EmptyStateProps = {
  icon: SymbolViewProps['name'];
  title: string;
  body?: string;
  action?: ReactNode;
};

/** Card shown when a section has nothing in it yet. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <SymbolView name={icon} size={28} tintColor={theme.textSecondary} />
      <ThemedText type="smallBold" style={styles.center}>
        {title}
      </ThemedText>
      {body ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {body}
        </ThemedText>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.four,
    borderCurve: 'continuous',
  },
  center: {
    textAlign: 'center',
  },
});
