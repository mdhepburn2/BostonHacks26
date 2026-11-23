import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScanButtonProps = { variant?: 'hero' | 'compact' };

/**
 * The web app can't scan, so Home's big card opens Search instead, and the compact row (which
 * is only on Search) is hidden.
 */
export function ScanButton({ variant = 'hero' }: ScanButtonProps) {
  const theme = useTheme();
  if (variant === 'compact') return null;

  return (
    <Pressable
      onPress={() => router.navigate('/search')}
      accessibilityRole="button"
      accessibilityLabel="Search for a place"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View style={[styles.hero, { backgroundColor: theme.tint }]}>
        <View style={[styles.sun, { backgroundColor: theme.yellow }]} />
        <View style={styles.ring} />
        <View style={styles.icon}>
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            size={30}
            tintColor={theme.onTint}
          />
        </View>
        <View style={styles.text}>
          <ThemedText type="subtitle" style={{ color: theme.onTint }}>
            Where to next?
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.onTint, opacity: 0.85 }}>
            Look up any building, statue or storefront in Boston.
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
    overflow: 'hidden',
  },
  // Decorative shapes peeking in from the corners, as on the phone's Scan card.
  sun: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    right: -48,
    bottom: -64,
  },
  ring: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    top: -22,
    left: -18,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
