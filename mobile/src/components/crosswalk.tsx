import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/** Crosswalk stripes, used as a decorative divider. */
export function Crosswalk({ color }: { color?: string }) {
  const theme = useTheme();

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: 12 }, (_, i) => (
        <View key={i} style={[styles.bar, { backgroundColor: color ?? theme.text }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    height: 10,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
  },
});
