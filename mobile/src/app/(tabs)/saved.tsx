import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { getSaved, updateSaved, type SavedChanges } from '@/api/saved';
import type { SavedListResponse, SavedPlace } from '@/api/types';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Loadable } from '@/components/loadable';
import { PlaceTile } from '@/components/place-tile';
import { SavedFilterBar } from '@/components/saved-filter-bar';
import { Screen } from '@/components/screen';
import { SignChip } from '@/components/sign-chip';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { VisitDatePrompt } from '@/components/visit-date-prompt';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshOnFocus, useRequest } from '@/hooks/use-request';
import { applySavedFilters, useSavedFilters } from '@/hooks/use-saved-filters';
import { useTheme } from '@/hooks/use-theme';
import { showAlert } from '@/utils/alert';
import { toIsoDate } from '@/utils/dates';

export default function SavedScreen() {
  const { status, user } = useAuth();
  const saved = useRequest(user ? `saved:${user.id}` : null, () => getSaved());
  useRefreshOnFocus(saved.refresh);

  return (
    <Screen
      title="Saved"
      subtitle="Places you want to go, and places you've been"
      refreshing={saved.refreshing}
      onRefresh={user ? saved.refresh : undefined}>
      {user ? (
        <Loadable
          state={saved}
          loadingLabel="Loading saved places..."
          errorTitle="Couldn't load your saved places">
          {(data) => <SavedList data={data} />}
        </Loadable>
      ) : status === 'signedOut' ? (
        <SignInPrompt
          icon={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
          title="Log in to see your saved places"
          body="Saved places show up here, with the ones you've visited checked off."
        />
      ) : null}
    </Screen>
  );
}

/** Edits made here since `data` loaded. A reload brings fresh data, which replaces them. */
type Edits = { base: SavedListResponse; byId: Record<number, SavedPlace> };

function SavedList({ data }: { data: SavedListResponse }) {
  const theme = useTheme();
  const filterState = useSavedFilters();
  const [edits, setEdits] = useState<Edits>({ base: data, byId: {} });
  const [pending, setPending] = useState<number[]>([]);
  const [checking, setChecking] = useState<SavedPlace | null>(null);

  const byId = edits.base === data ? edits.byId : {};
  const items = data.results.map((item) => byId[item.id] ?? item);
  const shown = applySavedFilters(items, filterState.filters);
  const visited = items.filter((item) => item.visited).length;

  const update = async (item: SavedPlace, changes: SavedChanges) => {
    setPending((ids) => [...ids, item.id]);
    try {
      const updated = await updateSaved(item.id, changes);
      setEdits((prev) => ({
        base: data,
        byId: { ...(prev.base === data ? prev.byId : {}), [item.id]: updated },
      }));
    } catch (err) {
      showAlert(
        "Couldn't update that place",
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setPending((ids) => ids.filter((id) => id !== item.id));
    }
  };

  if (!items.length) {
    return (
      <EmptyState
        accent="tint"
        icon={{ ios: 'bookmark', android: 'bookmark', web: 'bookmark' }}
        title="No saved places yet"
        body={
          Platform.OS === 'web'
            ? "Open any place from Search and tap Save. It'll show up here."
            : "Open any place from Search or a scan and tap Save. It'll show up here."
        }
      />
    );
  }

  return (
    <>
      <View style={styles.counts}>
        <SignChip label={`${items.length} saved`} background={theme.text} color={theme.background} />
        <SignChip
          label={`${visited} visited`}
          background={theme.green}
          color={theme.onGreen}
          icon={{ ios: 'checkmark', android: 'check', web: 'check' }}
        />
        <SignChip
          label={`${items.length - visited} to go`}
          background={theme.yellow}
          color={theme.onYellow}
          icon={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }}
        />
      </View>

      <SavedFilterBar state={filterState} items={items} />

      {shown.length ? (
        <View style={styles.list}>
          {shown.map((item) => (
            <PlaceTile
              key={item.id}
              place={item.place}
              saved={item}
              showVisibility
              pending={pending.includes(item.id)}
              onToggleVisited={() =>
                // Checking asks for the date; unchecking clears it straight away.
                item.visited ? update(item, { visited: false }) : setChecking(item)
              }
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
          title="Nothing matches"
          body="Try a different search, or clear the filters."
          action={
            <Button
              label="Clear search and filters"
              onPress={() => {
                filterState.clear();
                filterState.set('q', '');
              }}
            />
          }
        />
      )}

      <VisitDatePrompt
        placeName={checking?.place.name ?? null}
        onCancel={() => setChecking(null)}
        onConfirm={(date) => {
          if (checking) void update(checking, { visited_at: toIsoDate(date) });
          setChecking(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  counts: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.three,
  },
});
