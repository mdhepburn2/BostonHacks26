import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type LinkRowProps = {
  icon: SymbolViewProps['name'];
  label: string;
  /** A red count bubble, e.g. pending friend requests. Hidden when 0 or missing. */
  badge?: number;
  onPress: () => void;
};

/** A settings-style row that opens another screen. */
export function LinkRow({ icon, label, badge, onPress }: LinkRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} new` : label}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}>
      <SymbolView name={icon} size={20} tintColor={theme.text} />
      <ThemedText type="smallBold" style={styles.label}>
        {label}
      </ThemedText>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: theme.tint }]}>
          <ThemedText style={[styles.badgeText, { color: theme.onTint }]}>{badge}</ThemedText>
        </View>
      ) : null}
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={14}
        weight="bold"
        tintColor={theme.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
  },
  label: {
    flex: 1,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
});
