import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { deleteActivity, getActivity } from '@/api/activities';
import { getCircles } from '@/api/circles';
import { ApiError } from '@/api/client';
import type { Activity, UserSummary } from '@/api/types';
import { ActivityReplyButtons } from '@/components/activity-reply';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Loadable } from '@/components/loadable';
import { Avatar } from '@/components/person-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SignChip } from '@/components/sign-chip';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { ThemedText } from '@/components/themed-text';
import { OnAccent, Spacing, placeAccents } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshOnFocus, useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { showAlert } from '@/utils/alert';
import { formatWhen, isPast } from '@/utils/dates';

/** One plan: when and where, who posted it, and Interested / Going. The author can edit or delete it. */
export default function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, user } = useAuth();
  const activityId = Number(id);
  const activity = useRequest(user ? `activity:${activityId}:${user.id}` : null, () =>
    getActivity(activityId),
  );
  useRefreshOnFocus(activity.refresh);

  if (!user) {
    return (
      <Screen>
        {status === 'signedOut' ? (
          <SignInPrompt title="Log in to see this plan" body="Plans are shared with friends." />
        ) : null}
      </Screen>
    );
  }

  if (activity.error?.kind === 'not_found') {
    return (
      <Screen>
        <EmptyState
          icon={{ ios: 'calendar.badge.exclamationmark', android: 'event_busy', web: 'event_busy' }}
          title="Plan not found"
          body="It may have been deleted, or it isn't shared with you."
        />
      </Screen>
    );
  }

  return (
    <Screen refreshing={activity.refreshing} onRefresh={activity.refresh}>
      <Loadable state={activity} loadingLabel="Loading plan..." errorTitle="Couldn't load this plan">
        {(data) => (
          // Start over from the server's copy whenever it changes (e.g. after an edit).
          <LoadedActivity key={JSON.stringify(data)} initial={data} myId={user.id} />
        )}
      </Loadable>
    </Screen>
  );
}

function LoadedActivity({ initial, myId }: { initial: Activity; myId: number }) {
  const theme = useTheme();
  const [activity, setActivity] = useState(initial);
  const [deleting, setDeleting] = useState(false);
  const mine = activity.author.id === myId;
  const past = isPast(activity.starts_at);
  const { accent } = placeAccents(activity.place.id);

  const confirmDelete = () => {
    showAlert(`Delete "${activity.title}"?`, "Everyone's replies will be removed too.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteActivity(activity.id);
            if (router.canGoBack()) router.back();
            else router.replace('/activities');
          } catch (err) {
            setDeleting(false);
            showAlert(
              "Couldn't delete it",
              err instanceof ApiError ? err.message : 'Please try again.',
            );
          }
        },
      },
    ]);
  };

  return (
    <>
      <View style={styles.header}>
        <View style={styles.chips}>
          {past ? (
            <SignChip label="Happened" background={theme.backgroundSelected} color={theme.text} />
          ) : (
            <SignChip label="Plan" background={theme.yellow} color={theme.onYellow} />
          )}
          <SharedWith activity={activity} />
        </View>
        <ThemedText type="title">{activity.title}</ThemedText>
        <View style={styles.whenRow}>
          <SymbolView
            name={{ ios: 'calendar', android: 'event', web: 'event' }}
            size={18}
            tintColor={theme.textSecondary}
          />
          <ThemedText type="smallBold">{formatWhen(activity.starts_at)}</ThemedText>
        </View>
      </View>

      <Pressable
        onPress={() =>
          router.push({ pathname: '/place/[id]', params: { id: String(activity.place.id) } })
        }
        accessibilityRole="button"
        accessibilityLabel={`Open ${activity.place.name}`}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
        ]}>
        <View style={[styles.marker, { backgroundColor: theme[accent] }]}>
          <SymbolView
            name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }}
            size={18}
            tintColor={theme[OnAccent[accent]]}
          />
        </View>
        <ThemedText type="smallBold" numberOfLines={2} style={styles.flex}>
          {activity.place.name}
        </ThemedText>
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          weight="bold"
          tintColor={theme.textSecondary}
        />
      </Pressable>

      <Pressable
        onPress={() =>
          router.push({ pathname: '/user/[id]', params: { id: String(activity.author.id) } })
        }
        accessibilityRole="button"
        accessibilityLabel={`Posted by ${activity.author.username}`}
        style={({ pressed }) => [styles.author, { opacity: pressed ? 0.6 : 1 }]}>
        <Avatar user={activity.author} size={28} />
        <ThemedText type="small" themeColor="textSecondary">
          {'Posted by '}
          <ThemedText type="smallBold">{mine ? 'you' : activity.author.username}</ThemedText>
        </ThemedText>
      </Pressable>

      {activity.description ? <ThemedText>{activity.description}</ThemedText> : null}

      <ActivityReplyButtons activity={activity} onChange={setActivity} />

      <WhoReplied activity={activity} myId={myId} />

      {mine ? (
        <View style={styles.ownerActions}>
          <Button
            variant="plain"
            label="Edit"
            disabled={deleting}
            onPress={() =>
              router.push({ pathname: '/activities/new', params: { edit: String(activity.id) } })
            }
          />
          <Button variant="plain" label="Delete" loading={deleting} onPress={confirmDelete} />
        </View>
      ) : null}
    </>
  );
}

/** Who's going and who's interested, each person opening their profile. */
function WhoReplied({ activity, myId }: { activity: Activity; myId: number }) {
  const going = activity.responses.filter((r) => r.status === 'going');
  const interested = activity.responses.filter((r) => r.status === 'interested');
  if (!going.length && !interested.length) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        No replies yet. Be the first to say you&apos;re in.
      </ThemedText>
    );
  }
  return (
    <>
      {going.length ? (
        <Section title={`Going · ${going.length}`} accent="green">
          <PeopleList people={going.map((r) => r.user)} myId={myId} />
        </Section>
      ) : null}
      {interested.length ? (
        <Section title={`Interested · ${interested.length}`} accent="blue">
          <PeopleList people={interested.map((r) => r.user)} myId={myId} />
        </Section>
      ) : null}
    </>
  );
}

function PeopleList({ people, myId }: { people: UserSummary[]; myId: number }) {
  return (
    <View style={styles.people}>
      {people.map((person) => (
        <Pressable
          key={person.id}
          onPress={() =>
            router.push({ pathname: '/user/[id]', params: { id: String(person.id) } })
          }
          accessibilityRole="button"
          accessibilityLabel={person.id === myId ? 'You' : person.username}
          style={({ pressed }) => [styles.person, { opacity: pressed ? 0.6 : 1 }]}>
          <Avatar user={person} size={32} />
          <ThemedText type="smallBold">{person.id === myId ? 'You' : person.username}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

/** "Friends", "Everyone", or the circle's name (looked up from my circles). */
function SharedWith({ activity }: { activity: Activity }) {
  const theme = useTheme();
  const { user } = useAuth();
  const inCircle = activity.visibility === 'circle';
  const circles = useRequest(inCircle && user ? `circles:${user.id}` : null, getCircles);

  let label = activity.visibility === 'public' ? 'Everyone' : 'Friends';
  if (inCircle) {
    const circle = circles.data?.results.find((c) => c.id === activity.circle_id);
    label = circle ? circle.name : 'A circle';
  }

  return (
    <SignChip
      label={label}
      background={theme.blue}
      color={theme.blue}
      outline
      icon={
        activity.visibility === 'public'
          ? { ios: 'globe', android: 'public', web: 'public' }
          : { ios: 'person.2.fill', android: 'group', web: 'group' }
      }
    />
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  whenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  card: {
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
  flex: {
    flex: 1,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  people: {
    gap: Spacing.one,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  ownerActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
  },
});
