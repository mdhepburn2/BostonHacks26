import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { savePlace, unsave, updateSaved, type SavedChanges } from '@/api/saved';
import { getCircles } from '@/api/circles';
import type { SavedInfo, SavedPlace, Visibility } from '@/api/types';
import { Button } from '@/components/button';
import { Loadable } from '@/components/loadable';
import { SegmentedControl } from '@/components/segmented-control';
import { TagPicker } from '@/components/tag-picker';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { onCircleCreated } from '@/utils/circle-created';
import { formatDate, fromIsoDate, toIsoDate } from '@/utils/dates';

const SHARING_OPTIONS: readonly { value: Visibility; label: string }[] = [
  { value: 'private', label: 'Only me' },
  { value: 'friends', label: 'Friends' },
  { value: 'circle', label: 'Circle' },
  { value: 'public', label: 'Everyone' },
];

type SavePanelProps = {
  placeId: number;
  placeName: string;
  /** `saved` from the place card: null when not saved (or logged out). */
  initial: SavedInfo | null;
  /** Called with the server's latest state after each change (null once unsaved). */
  onChange?: (saved: SavedInfo | null) => void;
};

/**
 * Save / Unsave, who can see it, and "I've been here" with the visit date. Each change is
 * sent straight away; the panel shows what the server sent back.
 */
export function SavePanel({ placeId, placeName, initial, onChange }: SavePanelProps) {
  const theme = useTheme();
  const { status } = useAuth();
  const [saved, setSaved] = useState<SavedInfo | null>(initial);
  const [busy, setBusy] = useState<'save' | 'unsave' | 'visibility' | 'visited' | 'tags' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  if (status !== 'signedIn') {
    return (
      <View style={[styles.panel, { borderColor: theme.backgroundSelected }]}>
        <ThemedText type="small" themeColor="textSecondary">
          Log in to save this place and check it off once you&apos;ve been.
        </ThemedText>
        <Button label="Log in to save" onPress={() => router.push('/login')} />
      </View>
    );
  }

  /** Runs one change, keeps the panel in sync with the response, and shows any error. */
  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<SavedPlace | null>) => {
    setBusy(kind);
    setError(null);
    try {
      const result = await action();
      const next = result ? toInfo(result) : null;
      setSaved(next);
      onChange?.(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const change = (kind: 'visibility' | 'visited' | 'tags', changes: SavedChanges) => {
    if (saved) void run(kind, () => updateSaved(saved.id, changes));
  };

  const confirmUnsave = () => {
    if (!saved) return;
    Alert.alert(`Remove ${placeName}?`, 'Its visit date, note and tags will be removed too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          void run('unsave', async () => {
            await unsave(saved.id);
            return null;
          }),
      },
    ]);
  };

  const errorText = error ? (
    <ThemedText type="small" style={{ color: theme.tint }} accessibilityLiveRegion="polite">
      {error}
    </ThemedText>
  ) : null;

  if (!saved) {
    return (
      <View style={styles.unsaved}>
        <Button
          label="Save this place"
          onPress={() => void run('save', () => savePlace(placeId))}
          loading={busy === 'save'}
        />
        {errorText}
      </View>
    );
  }

  return (
    <View style={[styles.panel, { borderColor: theme.backgroundSelected }]}>
      <View style={styles.header}>
        <View style={[styles.savedBadge, { backgroundColor: theme.text }]}>
          <SymbolView
            name={{ ios: 'bookmark.fill', android: 'bookmark', web: 'bookmark' }}
            size={14}
            tintColor={theme.background}
          />
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            Saved
          </ThemedText>
        </View>
        <Button
          variant="plain"
          label="Remove"
          onPress={confirmUnsave}
          loading={busy === 'unsave'}
        />
      </View>

      <SharingPicker
        visibility={saved.visibility}
        circleId={saved.circle_id}
        busy={busy === 'visibility'}
        disabled={busy !== null}
        onChange={(changes) => change('visibility', changes)}
      />

      <VisitedRow
        visited={saved.visited}
        visitedAt={saved.visited_at}
        busy={busy === 'visited'}
        onToggle={(visited) =>
          // Checking it defaults the date to today; the date can be changed after.
          change('visited', visited ? { visited_at: toIsoDate(new Date()) } : { visited: false })
        }
        onDate={(date) => change('visited', { visited_at: toIsoDate(date) })}
      />

      <TagPicker
        selected={saved.tags ?? []}
        busy={busy === 'tags'}
        disabled={busy !== null}
        onChange={(tagIds) => change('tags', { tag_ids: tagIds })}
      />

      {errorText}
    </View>
  );
}

type SharingPickerProps = {
  visibility: Visibility;
  circleId: number | null;
  busy: boolean;
  disabled: boolean;
  onChange: (changes: SavedChanges) => void;
};

/** "Who can see it": only me, all friends, one of my circles (picked from a list), or everyone. */
function SharingPicker({ visibility, circleId, busy, disabled, onChange }: SharingPickerProps) {
  const theme = useTheme();
  const { user } = useAuth();
  // "A circle" tapped but no circle picked yet: show the list without saving anything.
  const [choosingCircle, setChoosingCircle] = useState(false);
  const showCircles = choosingCircle || visibility === 'circle';
  const circles = useRequest(showCircles && user ? `circles:${user.id}` : null, getCircles);

  const selected: Visibility = choosingCircle ? 'circle' : visibility;

  // "New circle" opens a sheet; when it reports the circle it made, share with it right away.
  // Coming back to this screen (made or cancelled) stops listening.
  const [awaitingCircle, setAwaitingCircle] = useState(false);
  const refreshCircles = circles.refresh;
  useEffect(() => {
    if (!awaitingCircle) return;
    return onCircleCreated((circle) => {
      setAwaitingCircle(false);
      setChoosingCircle(false);
      refreshCircles();
      onChange({ visibility: 'circle', circle_id: circle.id });
    });
  }, [awaitingCircle, onChange, refreshCircles]);
  useFocusEffect(useCallback(() => setAwaitingCircle(false), []));

  const newCircle = () => {
    if (disabled) return;
    setAwaitingCircle(true);
    router.push('/circles/new');
  };

  return (
    <View style={[styles.group, busy && styles.pending]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Who can see it
      </ThemedText>
      <SegmentedControl
        options={SHARING_OPTIONS}
        value={selected}
        onChange={(next) => {
          if (disabled) return;
          if (next === 'circle') {
            setChoosingCircle(true);
            return;
          }
          setChoosingCircle(false);
          if (next !== visibility) onChange({ visibility: next });
        }}
      />

      {showCircles ? (
        <Loadable state={circles} loadingLabel="Loading your circles..." errorTitle="Couldn't load your circles">
          {({ results }) =>
            <View style={styles.circleGroup}>
              {results.length ? (
                <View style={styles.circles}>
                  {results.map((circle) => {
                    const active = visibility === 'circle' && circle.id === circleId;
                    return (
                      <Pressable
                        key={circle.id}
                        onPress={() => {
                          if (disabled || active) return;
                          setChoosingCircle(false);
                          onChange({ visibility: 'circle', circle_id: circle.id });
                        }}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        style={({ pressed }) => [
                          styles.circleChip,
                          { borderColor: active ? theme.text : theme.backgroundSelected },
                          active && { backgroundColor: theme.text },
                          pressed && styles.pending,
                        ]}>
                        <ThemedText
                          type="smallBold"
                          style={{ color: active ? theme.background : theme.text }}>
                          {circle.name}
                        </ThemedText>
                        <ThemedText
                          type="small"
                          style={{ color: active ? theme.background : theme.textSecondary }}>
                          {circle.members.length}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                  <NewCircleChip onPress={newCircle} />
                </View>
              ) : (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    You&apos;re not in any circles yet. Make one with just the friends who should
                    see this place.
                  </ThemedText>
                  <View style={styles.circles}>
                    <NewCircleChip onPress={newCircle} />
                  </View>
                </>
              )}
            </View>
          }
        </Loadable>
      ) : null}
    </View>
  );
}

/** Dashed "+ New circle" chip at the end of the circle list. */
function NewCircleChip({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="New circle"
      style={({ pressed }) => [
        styles.circleChip,
        styles.newCircleChip,
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
        New circle
      </ThemedText>
    </Pressable>
  );
}

type VisitedRowProps = {
  visited: boolean;
  visitedAt: string | null;
  busy: boolean;
  onToggle: (visited: boolean) => void;
  onDate: (date: Date) => void;
};

function VisitedRow({ visited, visitedAt, busy, onToggle, onDate }: VisitedRowProps) {
  const theme = useTheme();
  // Android shows the picker as a dialog, so it only mounts while open.
  const [androidPickerOpen, setAndroidPickerOpen] = useState(false);
  const date = visitedAt ? fromIsoDate(visitedAt) : new Date();

  return (
    <View style={[styles.visitedRow, busy && styles.pending]}>
      <Pressable
        onPress={() => !busy && onToggle(!visited)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: visited, busy }}
        hitSlop={8}
        style={styles.checkRow}>
        <View
          style={[
            styles.checkbox,
            { borderColor: visited ? theme.green : theme.textSecondary },
            visited && { backgroundColor: theme.green },
          ]}>
          {visited ? (
            <SymbolView
              name={{ ios: 'checkmark', android: 'check', web: 'check' }}
              size={14}
              weight="bold"
              tintColor={theme.onGreen}
            />
          ) : null}
        </View>
        <ThemedText type="smallBold">{visited ? 'Visited' : "I've been here"}</ThemedText>
      </Pressable>

      {visited ? (
        Platform.OS === 'android' ? (
          <>
            <Button
              variant="plain"
              label={formatDate(date)}
              onPress={() => setAndroidPickerOpen(true)}
            />
            {androidPickerOpen ? (
              <DateTimePicker
                value={date}
                maximumDate={new Date()}
                presentation="dialog"
                accentColor={theme.tint}
                onValueChange={(_, picked) => {
                  setAndroidPickerOpen(false);
                  onDate(picked);
                }}
                onDismiss={() => setAndroidPickerOpen(false)}
              />
            ) : null}
          </>
        ) : (
          <DateTimePicker
            value={date}
            maximumDate={new Date()}
            display="compact"
            accentColor={theme.tint}
            disabled={busy}
            onValueChange={(_, picked) => onDate(picked)}
          />
        )
      ) : null}
    </View>
  );
}

function toInfo(saved: SavedPlace): SavedInfo {
  const { id, visited, visited_at, visibility, circle_id, tags } = saved;
  return { id, visited, visited_at, visibility, circle_id, tags };
}

const styles = StyleSheet.create({
  unsaved: {
    gap: Spacing.two,
  },
  // Outlined rather than filled, so the grey segmented control inside still stands out.
  panel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderWidth: 2,
    borderRadius: Spacing.four,
    borderCurve: 'continuous',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: 8,
  },
  group: {
    gap: Spacing.two,
  },
  circleGroup: {
    gap: Spacing.two,
  },
  circles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  circleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    borderWidth: 2,
  },
  newCircleChip: {
    gap: Spacing.one,
    borderStyle: 'dashed',
  },
  visitedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pending: {
    opacity: 0.5,
  },
});
