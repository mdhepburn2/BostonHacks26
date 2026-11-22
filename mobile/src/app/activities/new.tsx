import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { createActivity, getActivity, updateActivity } from '@/api/activities';
import { getCircles } from '@/api/circles';
import { ApiError } from '@/api/client';
import type { Activity, ActivityVisibility, PlaceSummary } from '@/api/types';
import { Button } from '@/components/button';
import { Loadable } from '@/components/loadable';
import { Screen } from '@/components/screen';
import { SearchField } from '@/components/search-field';
import { Section } from '@/components/section';
import { SegmentedControl } from '@/components/segmented-control';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { WhenPicker } from '@/components/when-picker';
import { OnAccent, Spacing, placeAccents } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from '@/hooks/use-location';
import { usePlaceSearch } from '@/hooks/use-place-search';
import { useRefreshOnFocus, useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';

const SHARING_OPTIONS: readonly { value: ActivityVisibility; label: string }[] = [
  { value: 'friends', label: 'Friends' },
  { value: 'circle', label: 'Circle' },
  { value: 'public', label: 'Everyone' },
];

/** A place to start from: the place card's place, or nothing (pick one by searching). */
type PlaceChoice = Pick<PlaceSummary, 'id' | 'name'>;

/**
 * Post a plan (place, title, when, who can see it), or edit one with `?edit=<id>`. Opened
 * from the Activities screen, and from a place card with `placeId` / `placeName` filled in.
 */
export default function NewActivityScreen() {
  const { edit, placeId, placeName } = useLocalSearchParams<{
    edit?: string;
    placeId?: string;
    placeName?: string;
  }>();
  const { status, user } = useAuth();
  const editId = edit ? Number(edit) : null;
  const existing = useRequest(user && editId ? `activity:${editId}:${user.id}` : null, () =>
    getActivity(editId!),
  );

  if (!user) {
    return (
      <Screen>
        {status === 'signedOut' ? (
          <SignInPrompt title="Log in to make plans" body="Plans are shared with your friends." />
        ) : null}
      </Screen>
    );
  }

  if (editId) {
    return (
      <Screen>
        <Loadable state={existing} loadingLabel="Loading plan..." errorTitle="Couldn't load this plan">
          {(activity) => <ActivityForm existing={activity} initialPlace={activity.place} />}
        </Loadable>
      </Screen>
    );
  }

  const fromCard = placeId && placeName ? { id: Number(placeId), name: placeName } : null;
  return (
    <Screen>
      <ActivityForm existing={null} initialPlace={fromCard} />
    </Screen>
  );
}

/** Two hours from now, on the hour: a sensible default that's never in the past. */
function defaultStart() {
  const date = new Date(Date.now() + 2 * 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return date;
}

type ActivityFormProps = {
  existing: Activity | null;
  initialPlace: PlaceChoice | null;
};

function ActivityForm({ existing, initialPlace }: ActivityFormProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const [place, setPlace] = useState<PlaceChoice | null>(initialPlace);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [startsAt, setStartsAt] = useState(() =>
    existing ? new Date(existing.starts_at) : defaultStart(),
  );
  const [visibility, setVisibility] = useState<ActivityVisibility>(existing?.visibility ?? 'friends');
  const [circleId, setCircleId] = useState<number | null>(existing?.circle_id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const circles = useRequest(
    visibility === 'circle' && user ? `circles:${user.id}` : null,
    getCircles,
  );
  // Pick up a circle made from "New circle" below.
  useRefreshOnFocus(circles.refresh);

  const startChanged = !existing || new Date(existing.starts_at).getTime() !== startsAt.getTime();
  const ready =
    place !== null &&
    title.trim().length > 0 &&
    (visibility !== 'circle' || circleId !== null);

  const submit = async () => {
    if (!ready || submitting) return;
    // Only a new or changed start time has to be in the future.
    if (startChanged && startsAt.getTime() < Date.now()) {
      setError("Pick a time that hasn't passed yet.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const fields = {
      title: title.trim(),
      description: description.trim(),
      visibility,
      circle_id: visibility === 'circle' ? circleId : null,
      ...(startChanged ? { starts_at: startsAt.toISOString() } : {}),
    };
    try {
      if (existing) {
        await updateActivity(existing.id, fields);
        router.back();
      } else {
        const created = await createActivity({
          ...fields,
          place_id: place.id,
          starts_at: startsAt.toISOString(),
        });
        router.replace({ pathname: '/activities/[id]', params: { id: String(created.id) } });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <>
      <View style={styles.header}>
        <ThemedText type="title">{existing ? 'Edit plan' : 'New plan'}</ThemedText>
        <ThemedText themeColor="textSecondary">
          Pick a place and a time. Friends can say they&apos;re interested or going.
        </ThemedText>
      </View>

      <Section title="Where" accent="yellow">
        {place ? (
          <ChosenPlace
            place={place}
            // The place of an existing plan can't change (the API doesn't allow it).
            onChange={existing ? undefined : () => setPlace(null)}
          />
        ) : (
          <PlacePicker onPick={setPlace} />
        )}
      </Section>

      <View style={styles.fields}>
        <TextField
          label="What's the plan?"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Sunday brunch"
          autoCapitalize="sentences"
          maxLength={120}
        />
        <WhenPicker value={startsAt} onChange={setStartsAt} disabled={submitting} />
        <TextField
          label="Details (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="Where to meet, what to bring..."
          autoCorrect
          multiline
          maxLength={2000}
        />
      </View>

      <Section title="Who can see it" accent="blue">
        <SegmentedControl
          options={SHARING_OPTIONS}
          value={visibility}
          onChange={(next) => !submitting && setVisibility(next)}
        />
        {visibility === 'circle' ? (
          <Loadable state={circles} loadingLabel="Loading your circles..." errorTitle="Couldn't load your circles">
            {({ results }) =>
              results.length ? (
                <View style={styles.chips}>
                  {results.map((circle) => {
                    const active = circle.id === circleId;
                    return (
                      <Pressable
                        key={circle.id}
                        onPress={() => !submitting && setCircleId(circle.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        style={({ pressed }) => [
                          styles.chip,
                          { borderColor: active ? theme.text : theme.backgroundSelected },
                          active && { backgroundColor: theme.text },
                          pressed && styles.pressed,
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
                </View>
              ) : (
                <View style={styles.noCircles}>
                  <ThemedText type="small" themeColor="textSecondary">
                    You&apos;re not in any circles yet. Make one, then come back to share this plan
                    with it.
                  </ThemedText>
                  <Button variant="plain" label="New circle" onPress={() => router.push('/circles/new')} />
                </View>
              )
            }
          </Loadable>
        ) : null}
      </Section>

      {error ? (
        <ThemedText type="small" style={{ color: theme.tint }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}

      <Button
        label={existing ? 'Save changes' : 'Post plan'}
        onPress={() => void submit()}
        loading={submitting}
        disabled={!ready}
      />
    </>
  );
}

function ChosenPlace({ place, onChange }: { place: PlaceChoice; onChange?: () => void }) {
  const theme = useTheme();
  const { accent } = placeAccents(place.id);
  return (
    <View style={[styles.placeRow, { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.marker, { backgroundColor: theme[accent] }]}>
        <SymbolView
          name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }}
          size={18}
          tintColor={theme[OnAccent[accent]]}
        />
      </View>
      <ThemedText type="smallBold" numberOfLines={2} style={styles.flex}>
        {place.name}
      </ThemedText>
      {onChange ? <Button variant="plain" size="small" label="Change" onPress={onChange} /> : null}
    </View>
  );
}

/** Search for the place by name; tapping a result picks it. */
function PlacePicker({ onPick }: { onPick: (place: PlaceChoice) => void }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  // Ranks nearby places higher if location is already allowed; never prompts here.
  const { coords } = useLocation();
  const search = usePlaceSearch(query, coords);

  return (
    <View style={styles.picker}>
      <SearchField value={query} onChangeText={setQuery} placeholder="Search for a place" />
      {search.idle ? null : search.error && !search.results.length ? (
        <View style={styles.noCircles}>
          <ThemedText type="small" themeColor="textSecondary">
            {search.error.message}
          </ThemedText>
          <Button variant="plain" size="small" label="Try again" onPress={search.retry} />
        </View>
      ) : search.results.length ? (
        search.results.slice(0, 6).map((result) => (
          <Pressable
            key={result.id}
            onPress={() => onPick(result)}
            accessibilityRole="button"
            accessibilityLabel={`Pick ${result.name}`}
            style={({ pressed }) => [
              styles.result,
              { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
            ]}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {result.name}
            </ThemedText>
            {result.address ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {result.address}
              </ThemedText>
            ) : null}
          </Pressable>
        ))
      ) : search.loading ? (
        <ThemedText type="small" themeColor="textSecondary">
          Searching...
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          No places found for &ldquo;{search.resultsFor}&rdquo;.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
    paddingTop: Spacing.three,
  },
  fields: {
    gap: Spacing.three,
  },
  picker: {
    gap: Spacing.two,
  },
  result: {
    gap: Spacing.half,
    minHeight: 56,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    paddingVertical: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
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
  flex: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    borderWidth: 2,
  },
  noCircles: {
    gap: Spacing.one,
    alignItems: 'flex-start',
  },
  pressed: {
    opacity: 0.5,
  },
});
