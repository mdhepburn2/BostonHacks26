import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScanButtonProps = {
  /** "hero" is the big card on Home; "compact" is a single row for other screens. */
  variant?: 'hero' | 'compact';
};

/** Opens the camera (the `scan` modal). */
export function ScanButton({ variant = 'hero' }: ScanButtonProps) {
  const theme = useTheme();
  const hero = variant === 'hero';

  return (
    <Pressable
      onPress={() => router.push('/scan')}
      accessibilityRole="button"
      accessibilityLabel="Scan a place with your camera"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View
        style={[styles.base, hero ? styles.hero : styles.compact, { backgroundColor: theme.tint }]}>
        <View style={[styles.iconWrap, hero && styles.iconWrapHero]}>
          <SymbolView
            name={{ ios: 'camera.viewfinder', android: 'photo_camera', web: 'photo_camera' }}
            size={hero ? 30 : 20}
            tintColor={theme.onTint}
          />
        </View>
        <View style={styles.text}>
          <ThemedText type={hero ? 'subtitle' : 'smallBold'} style={{ color: theme.onTint }}>
            {hero ? "What's in front of you?" : 'Scan a place'}
          </ThemedText>
          {hero ? (
            <ThemedText type="small" style={{ color: theme.onTint, opacity: 0.85 }}>
              Point your camera at a building, statue or storefront.
            </ThemedText>
          ) : null}
        </View>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          weight="bold"
          tintColor={theme.onTint}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    borderCurve: 'continuous',
  },
  hero: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Spacing.four,
  },
  compact: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapHero: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
