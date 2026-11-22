import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { SavedPlace, Visibility } from '@/api/types';
import { ChoiceChips } from '@/components/choice-chips';
import { SearchField } from '@/components/search-field';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import {
  priceOptions,
  tagOptions,
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
  const tags = tagOptions(items);
  // A filter on a tag that's since been removed from every place would hide everything.
  const tagFilter = tags.some((tag) => String(tag.id) === filters.tag) ? filters.tag : 'any';

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

      {tags.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagScroll}
          contentContainerStyle={styles.tagRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Filter by tag">
          {[{ id: 'any', name: 'All tags' }, ...tags.map((t) => ({ id: String(t.id), name: t.name }))].map(
            (tag) => {
              const selected = tagFilter === tag.id;
              return (
                <Pressable
                  key={tag.id}
                  onPress={() => set('tag', selected && tag.id !== 'any' ? 'any' : tag.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={({ pressed }) => [
                    styles.tagChip,
                    selected
                      ? { backgroundColor: theme.text, borderColor: theme.text }
                      : { borderColor: theme.backgroundSelected },
                    pressed && styles.pressed,
                  ]}>
                  {tag.id === 'any' ? null : (
                    <SymbolView
                      name={{ ios: 'tag.fill', android: 'sell', web: 'sell' }}
                      size={12}
                      tintColor={selected ? theme.background : theme.textSecondary}
                    />
                  )}
                  <ThemedText
                    type="smallBold"
                    style={{ color: selected ? theme.background : theme.text }}>
                    {tag.name}
                  </ThemedText>
                </Pressable>
              );
            },
          )}
        </ScrollView>
      ) : null}

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
  // Run the tag row edge to edge, so chips scroll out from under the screen's padding.
  tagScroll: {
    marginHorizontal: -Spacing.three,
  },
  tagRow: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    borderWidth: 2,
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
