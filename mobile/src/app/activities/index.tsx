import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getActivities } from '@/api/activities';
import { ActivityRow } from '@/components/activity-row';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Loadable } from '@/components/loadable';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshOnFocus, useRequest } from '@/hooks/use-request';
import { isPast } from '@/utils/dates';

/** Every plan I can see (mine and friends'), upcoming first, plus "Plan something". */
export default function ActivitiesScreen() {
  const { status, user } = useAuth();
  const activities = useRequest(user ? `activities:${user.id}` : null, getActivities);
  useRefreshOnFocus(activities.refresh);

  if (!user) {
    return (
      <Screen>
        {status === 'signedOut' ? (
          <SignInPrompt
            title="Log in to see plans"
            body="Post a plan at a place and see who's interested or going."
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen refreshing={activities.refreshing} onRefresh={activities.refresh}>
      <ThemedText themeColor="textSecondary">
        Plans at places around Boston. Say you&apos;re interested or going, or post your own.
      </ThemedText>
      <Button label="Plan something" onPress={() => router.push('/activities/new')} />
      <Loadable state={activities} loadingLabel="Loading plans..." errorTitle="Couldn't load plans">
        {({ results }) => {
          // The API already sorts upcoming (soonest first) ahead of past (latest first).
          const upcoming = results.filter((a) => !isPast(a.starts_at));
          const past = results.filter((a) => isPast(a.starts_at));
          if (!results.length) {
            return (
              <EmptyState
                accent="yellow"
                icon={{ ios: 'calendar', android: 'event', web: 'event' }}
                title="No plans yet"
                body="Pick a place, a time, and who to invite. Friends can say they're interested or going."
              />
            );
          }
          return (
            <>
              <Section title="Upcoming" accent="yellow">
                {upcoming.length ? (
                  <View style={styles.list}>
                    {upcoming.map((activity) => (
                      <ActivityRow key={activity.id} activity={activity} myId={user.id} />
                    ))}
                  </View>
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    Nothing coming up. Plan something!
                  </ThemedText>
                )}
              </Section>
              {past.length ? (
                <Section title="Past">
                  <View style={styles.list}>
                    {past.map((activity) => (
                      <ActivityRow key={activity.id} activity={activity} myId={user.id} />
                    ))}
                  </View>
                </Section>
              ) : null}
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
});
