import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { PlaceSummary, SavedPlace, Visibility } from '@/api/types';
import { SignChip } from '@/components/sign-chip';
import { ThemedText } from '@/components/themed-text';
import { Fonts, OnAccent, Spacing, placeAccents } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PlaceTileProps = {
  place: PlaceSummary;
  /** "tile" is a small square for horizontal rows; "row" fills the width of a list. */
  variant?: 'tile' | 'row';
  saved?: Pick<SavedPlace, 'visited' | 'visited_at' | 'tags' | 'visibility'>;
  /** Show who can see it (only for my own saved places). */
  showVisibility?: boolean;
};

const VISIBILITY_ICONS: Record<Visibility, SymbolViewProps['name']> = {
  private: { ios: 'lock.fill', android: 'lock', web: 'lock' },
  friends: { ios: 'person.2.fill', android: 'group', web: 'group' },
  circle: { ios: 'person.3.fill', android: 'groups', web: 'groups' },
  public: { ios: 'globe', android: 'public', web: 'public' },
};

/** A compact, colourful place card that opens the full place card when tapped. */
export function PlaceTile({ place, variant = 'row', saved, showVisibility }: PlaceTileProps) {
  const theme = useTheme();
  const { accent, shape } = placeAccents(place.id);
  const background = theme[accent];
  const foreground = theme[OnAccent[accent]];
  const tile = variant === 'tile';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/place/[id]', params: { id: String(place.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`Open ${place.name}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View style={[styles.base, tile ? styles.tile : styles.row, { backgroundColor: background }]}>
        <View
          style={[tile ? styles.tileCircle : styles.rowCircle, { backgroundColor: theme[shape] }]}
        />

        <View style={styles.top}>
          {saved ? (
            saved.visited ? (
              <SignChip
                label={saved.visited_at ? `Visited ${shortDate(saved.visited_at)}` : 'Visited'}
                background={foreground}
                color={background}
                icon={{ ios: 'checkmark', android: 'check', web: 'check' }}
              />
            ) : (
              <SignChip label="Want to go" background={background} color={foreground} outline />
            )
          ) : (
            <View />
          )}
          {saved && showVisibility ? (
            <SymbolView
              name={VISIBILITY_ICONS[saved.visibility]}
              size={18}
              tintColor={theme[OnAccent[shape]]}
              accessibilityLabel={`Visible to: ${saved.visibility}`}
            />
          ) : null}
        </View>

        <View style={styles.bottom}>
          <ThemedText
            numberOfLines={tile ? 3 : 2}
            style={[tile ? styles.tileName : styles.rowName, { color: foreground }]}>
            {place.name}
          </ThemedText>
          {!tile && saved?.tags.length ? (
            <View style={styles.tags}>
              {saved.tags.map((tag) => (
                <SignChip key={tag.id} label={tag.name} background={foreground} color={background} />
              ))}
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** "2026-11-15" → "Nov 15", read as a local date so it doesn't shift a day. */
function shortDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    borderCurve: 'continuous',
    justifyContent: 'space-between',
  },
  tile: {
    width: 156,
    height: 184,
    padding: 14,
    borderRadius: 22,
  },
  row: {
    minHeight: 136,
    padding: Spacing.three,
    borderRadius: Spacing.four,
    gap: Spacing.three,
  },
  tileCircle: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    top: -40,
    right: -40,
  },
  rowCircle: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    top: -44,
    right: -36,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingRight: Spacing.one,
  },
  bottom: {
    gap: Spacing.two,
  },
  tileName: {
    fontFamily: Fonts.display,
    fontSize: 20,
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  rowName: {
    fontFamily: Fonts.display,
    fontSize: 26,
    lineHeight: 28,
    letterSpacing: -0.5,
    paddingRight: Spacing.five,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
});
