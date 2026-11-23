import type { TabTriggerSlotProps } from 'expo-router/ui';
import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// TabTrigger's ref type doesn't line up with Pressable's, so it's left out; it's still passed along.
type WebTabButtonProps = Omit<TabTriggerSlotProps, 'ref'> & {
  label: string;
  icon: AndroidSymbol;
  /** Icon beside the label (top bar) rather than above it (bottom bar). */
  wide: boolean;
};

/** One tab in the web tab bar. The rest of its props come from <TabTrigger asChild>. */
export function WebTabButton({ label, icon, wide, isFocused, ...props }: WebTabButtonProps) {
  const theme = useTheme();
  const color = isFocused ? theme.tint : theme.textSecondary;

  return (
    <Pressable
      {...props}
      aria-current={isFocused ? 'page' : undefined}
      style={({ pressed }) => [
        styles.base,
        wide ? styles.wide : styles.stacked,
        wide && isFocused && { backgroundColor: theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <SymbolView name={{ web: icon, android: icon }} size={wide ? 20 : 24} tintColor={color} />
      <ThemedText style={[styles.label, wide && styles.wideLabel, { color }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  wide: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 22,
  },
  stacked: {
    flex: 1,
    gap: Spacing.half,
  },
  label: {
    fontFamily: Fonts.label,
    fontSize: 11,
    lineHeight: 14,
  },
  wideLabel: {
    fontSize: 15,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.7,
  },
});
