import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PlaceSummary } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { OnAccent, Spacing, placeAccents } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CandidateListProps = {
  candidates: PlaceSummary[];
  onPick: (place: PlaceSummary) => void;
};

/** "Is it one of these?" rows after a scan. Each row has the place's own sign colour. */
export function CandidateList({ candidates, onPick }: CandidateListProps) {
  const theme = useTheme();

  return (
    <View style={styles.list}>
      {candidates.map((place) => {
        const { accent } = placeAccents(place.id);
        return (
          <Pressable
            key={place.id}
            onPress={() => onPick(place)}
            accessibilityRole="button"
            accessibilityLabel={`It's ${place.name}`}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
            ]}>
            <View style={[styles.icon, { backgroundColor: theme[accent] }]}>
              <SymbolView
                name={{ ios: 'mappin', android: 'place', web: 'place' }}
                size={18}
                tintColor={theme[OnAccent[accent]]}
              />
            </View>
            <ThemedText type="smallBold" style={styles.name} numberOfLines={2}>
              {place.name}
            </ThemedText>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={14}
              weight="bold"
              tintColor={theme.textSecondary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
  },
});
