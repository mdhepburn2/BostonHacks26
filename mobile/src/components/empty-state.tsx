import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { type Accent, OnAccent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EmptyStateProps = {
  icon: SymbolViewProps['name'];
  title: string;
  body?: string;
  action?: ReactNode;
  /** Puts the icon on a coloured sign tile instead of plain grey. */
  accent?: Accent;
};

/** Card shown when a section has nothing in it yet. */
export function EmptyState({ icon, title, body, action, accent }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      {accent ? (
        <View style={[styles.iconTile, { backgroundColor: theme[accent] }]}>
          <SymbolView name={icon} size={24} tintColor={theme[OnAccent[accent]]} />
        </View>
      ) : (
        <SymbolView name={icon} size={28} tintColor={theme.textSecondary} />
      )}
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
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  center: {
    textAlign: 'center',
  },
});
