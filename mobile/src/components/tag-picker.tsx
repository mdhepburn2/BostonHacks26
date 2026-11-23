import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ApiError } from '@/api/client';
import { createTag, deleteTag, getTags } from '@/api/tags';
import type { Tag } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { showAlert } from '@/utils/alert';

/** The API's limit on a tag name. */
const MAX_TAG_LENGTH = 50;

type TagPickerProps = {
  /** Tags on this saved place now. */
  selected: Tag[];
  busy: boolean;
  disabled: boolean;
  /** Replace the place's tags with these ids. */
  onChange: (tagIds: number[]) => void;
};

/**
 * My own tags as toggle chips, plus "New tag" to make one and put it on this place.
 * Long-press a tag to delete it everywhere.
 */
export function TagPicker({ selected, busy, disabled, onChange }: TagPickerProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const tags = useRequest(user ? `tags:${user.id}` : null, getTags);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIds = selected.map((tag) => tag.id);
  // Tags on the place that the list hasn't caught up with yet still show.
  const all = [...(tags.data?.results ?? [])];
  for (const tag of selected) {
    if (!all.some((t) => t.id === tag.id)) all.push({ ...tag, count: 1 });
  }
  all.sort((a, b) => a.name.localeCompare(b.name));
  const locked = disabled || working;

  const toggle = (tag: Tag) => {
    if (locked) return;
    onChange(
      selectedIds.includes(tag.id)
        ? selectedIds.filter((id) => id !== tag.id)
        : [...selectedIds, tag.id],
    );
  };

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed || locked) return;
    setWorking(true);
    setError(null);
    try {
      const tag = await createTag(trimmed);
      tags.refresh();
      setName('');
      setAdding(false);
      if (!selectedIds.includes(tag.id)) onChange([...selectedIds, tag.id]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't make that tag. Please try again.");
    } finally {
      setWorking(false);
    }
  };

  const confirmDelete = (tag: Tag) => {
    if (locked) return;
    showAlert(`Delete "${tag.name}"?`, 'It comes off every place it’s on. The places stay saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setWorking(true);
          setError(null);
          try {
            await deleteTag(tag.id);
            tags.refresh();
            // The server already took it off this place; keep the panel in step.
            if (selectedIds.includes(tag.id)) onChange(selectedIds.filter((id) => id !== tag.id));
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't delete that tag.");
          } finally {
            setWorking(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.group, busy && styles.pending]}>
      <View style={styles.header}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Tags
        </ThemedText>
        {all.length ? (
          <ThemedText type="small" themeColor="textSecondary">
            Hold a tag to delete it
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.chips}>
        {all.map((tag) => {
          const on = selectedIds.includes(tag.id);
          return (
            <Pressable
              key={tag.id}
              onPress={() => toggle(tag)}
              onLongPress={() => confirmDelete(tag)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: locked }}
              accessibilityHint="Hold to delete this tag"
              style={({ pressed }) => [
                styles.chip,
                on
                  ? { backgroundColor: theme.text, borderColor: theme.text }
                  : { borderColor: theme.backgroundSelected },
                pressed && styles.pending,
              ]}>
              <SymbolView
                name={
                  on
                    ? { ios: 'checkmark', android: 'check', web: 'check' }
                    : { ios: 'tag', android: 'sell', web: 'sell' }
                }
                size={12}
                weight="bold"
                tintColor={on ? theme.background : theme.textSecondary}
              />
              <ThemedText type="smallBold" style={{ color: on ? theme.background : theme.text }}>
                {tag.name}
              </ThemedText>
            </Pressable>
          );
        })}

        {adding ? null : (
          <Pressable
            onPress={() => !locked && setAdding(true)}
            accessibilityRole="button"
            accessibilityLabel="New tag"
            style={({ pressed }) => [
              styles.chip,
              styles.newChip,
              { borderColor: theme.tint },
              pressed && styles.pending,
            ]}>
            <SymbolView
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              size={12}
              weight="bold"
              tintColor={theme.tint}
            />
            <ThemedText type="smallBold" style={{ color: theme.tint }}>
              New tag
            </ThemedText>
          </Pressable>
        )}
      </View>

      {adding ? (
        <View style={styles.addRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Date night, Rainy day"
            placeholderTextColor={theme.textSecondary}
            autoFocus
            autoCorrect={false}
            maxLength={MAX_TAG_LENGTH}
            returnKeyType="done"
            onSubmitEditing={() => void add()}
            accessibilityLabel="New tag name"
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          />
          <Pressable
            onPress={() => void add()}
            disabled={!name.trim() || locked}
            accessibilityRole="button"
            accessibilityLabel="Add tag"
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: theme.tint, opacity: !name.trim() ? 0.5 : pressed ? 0.8 : 1 },
            ]}>
            {working ? (
              <ActivityIndicator color={theme.onTint} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.onTint }}>
                Add
              </ThemedText>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setAdding(false);
              setName('');
              setError(null);
            }}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.cancel}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Cancel
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <ThemedText type="small" selectable style={{ color: theme.tint }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
    borderWidth: 2,
  },
  newChip: {
    borderStyle: 'dashed',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
    fontFamily: Fonts.body,
    fontSize: 16,
  },
  addButton: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: Spacing.three,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: {
    minHeight: 44,
    justifyContent: 'center',
  },
  pending: {
    opacity: 0.5,
  },
});
