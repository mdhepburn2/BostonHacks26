import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { SearchResult } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { OnAccent, Spacing, placeAccents } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** One place in the search results. Tapping it opens the place card. */
export function SearchResultRow({ place }: { place: SearchResult }) {
  const theme = useTheme();
  const { accent } = placeAccents(place.id);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/place/[id]', params: { id: String(place.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`Open ${place.name}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <View style={[styles.marker, { backgroundColor: theme[accent] }]}>
        <SymbolView
          name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }}
          size={18}
          tintColor={theme[OnAccent[accent]]}
        />
      </View>
      <View style={styles.text}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {place.name}
        </ThemedText>
        {place.address ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {place.address}
          </ThemedText>
        ) : null}
      </View>
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
    minHeight: 64,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
  },
  marker: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
