import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { SavedPlace, Visibility } from '@/api/types';
import { ChoiceChips } from '@/components/choice-chips';
import { SearchField } from '@/components/search-field';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import {
  priceOptions,
  typeLabel,
  typeOptions,
  type SavedSort,
  type VisitedFilter,
  type useSavedFilters,
} from '@/hooks/use-saved-filters';
import { useTheme } from '@/hooks/use-theme';

const SORTS: readonly { value: SavedSort; label: string }[] = [
  { value: 'saved', label: 'Recently saved' },
  { value: 'visited', label: 'Recently visited' },
  { value: 'name', label: 'Name' },
];

const VISITED: readonly { value: VisitedFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'not_visited', label: 'Want to go' },
  { value: 'visited', label: 'Visited' },
];

const VISIBILITY: readonly { value: Visibility | 'any'; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'private', label: 'Only me' },
  { value: 'friends', label: 'Friends' },
  { value: 'circle', label: 'Circle' },
  { value: 'public', label: 'Everyone' },
];

type SavedFilterBarProps = {
  state: ReturnType<typeof useSavedFilters>;
  /** All saved places, to offer only the prices and types that actually appear. */
  items: SavedPlace[];
};

/** Search box plus a Filters button that opens sort and filter chips. */
export function SavedFilterBar({ state, items }: SavedFilterBarProps) {
  const theme = useTheme();
  const { filters, set, clear, activeCount } = state;
  const [open, setOpen] = useState(false);

  const prices = priceOptions(items);
  const types = typeOptions(items);

  return (
    <View style={styles.bar}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <SearchField value={filters.q} onChangeText={(q) => set('q', q)} placeholder="Search saved" />
        </View>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={activeCount ? `Filters, ${activeCount} on` : 'Filters'}
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [
            styles.filterButton,
            { backgroundColor: open || activeCount ? theme.text : theme.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <SymbolView
            name={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
            size={20}
            tintColor={open || activeCount ? theme.background : theme.text}
          />
          {activeCount ? (
            <View style={[styles.badge, { backgroundColor: theme.tint }]}>
              <ThemedText style={[styles.badgeText, { color: theme.onTint }]}>{activeCount}</ThemedText>
            </View>
          ) : null}
        </Pressable>
      </View>

      {open ? (
        <View style={[styles.panel, { borderColor: theme.backgroundSelected }]}>
          <ChoiceChips label="Sort by" options={SORTS} value={filters.sort} onChange={(v) => set('sort', v)} />
          <ChoiceChips label="Visited" options={VISITED} value={filters.visited} onChange={(v) => set('visited', v)} />
          <ChoiceChips
            label="Who can see it"
            options={VISIBILITY}
            value={filters.visibility}
            onChange={(v) => set('visibility', v)}
          />
          {prices.length ? (
            <ChoiceChips
              label="Price"
              options={[{ value: 'any', label: 'Any' }, ...prices.map((p) => ({ value: p, label: p }))]}
              value={filters.price}
              onChange={(v) => set('price', v)}
            />
          ) : null}
          {types.length ? (
            <ChoiceChips
              label="Type"
              options={[
                { value: 'any', label: 'Any' },
                ...types.map((t) => ({ value: t, label: typeLabel(t) })),
              ]}
              value={filters.type}
              onChange={(v) => set('type', v)}
            />
          ) : null}
          {activeCount ? (
            <Pressable onPress={clear} accessibilityRole="button" hitSlop={8} style={styles.clear}>
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                Clear filters
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    gap: Spacing.three,
  },
  searchRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  search: {
    flex: 1,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    lineHeight: 14,
  },
  panel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 2,
    borderRadius: Spacing.four,
    borderCurve: 'continuous',
  },
  clear: {
    minHeight: 36,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
