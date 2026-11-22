import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { getProfile, getUserSaved } from '@/api/social';
import type { Profile, SavedListResponse } from '@/api/types';
import { EmptyState } from '@/components/empty-state';
import { Loadable } from '@/components/loadable';
import { PlaceTile } from '@/components/place-tile';
import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { AccentKeys, OnAccent, Spacing } from '@/constants/theme';
import { useRefreshOnFocus, useRequest, type RequestState } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';

export type ProfileData = {
  profile: RequestState<Profile>;
  saved: RequestState<SavedListResponse>;
  refresh: () => void;
  refreshing: boolean;
};

/** Loads a profile and the saved places I'm allowed to see. Reloads when the screen refocuses. */
export function useProfileData(userId: number): ProfileData {
  const profile = useRequest(`profile:${userId}`, () => getProfile(userId));
  const saved = useRequest(`user-saved:${userId}`, () => getUserSaved(userId));
  const refresh = () => {
    profile.refresh();
    saved.refresh();
  };
  useRefreshOnFocus(refresh);
  return { profile, saved, refresh, refreshing: profile.refreshing || saved.refreshing };
}

type ProfileViewProps = {
  data: ProfileData;
  /** Shown before the profile loads (e.g. the logged-in username). */
  username: string;
  userId: number;
  /** My own profile: show what others can see, plus an email line. */
  isMe: boolean;
  email?: string;
  /** Buttons under the stats: log out on mine, friend actions on someone else's (step 15). */
  actions?: ReactNode;
};

/**
 * A profile as other people see it: initials, username, stats, and the saved places they're
 * allowed to see. Used for my own Profile tab and (later) for user/[id].
 */
export function ProfileView({ data, username, userId, isMe, email, actions }: ProfileViewProps) {
  const theme = useTheme();
  const accent = AccentKeys[userId % AccentKeys.length];
  const counts = data.profile.data?.counts;
  const name = data.profile.data?.username ?? username;

  const stats = [
    { label: 'Friends', value: counts?.friends },
    { label: isMe ? 'Saved' : 'Shared', value: counts?.saved },
    { label: 'Visited', value: counts?.visited },
  ];

  return (
    <>
      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: theme[accent] }]}>
          <ThemedText type="subtitle" style={{ color: theme[OnAccent[accent]] }}>
            {name.slice(0, 1).toUpperCase()}
          </ThemedText>
        </View>
        <View style={styles.names}>
          <ThemedText type="subtitle">{name}</ThemedText>
          {email ? (
            <ThemedText type="small" themeColor="textSecondary">
              {email}
            </ThemedText>
          ) : null}
        </View>
      </View>

      <View style={[styles.stats, { backgroundColor: theme.backgroundElement }]}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <ThemedText type="subtitle">{stat.value ?? '–'}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {stat.label}
            </ThemedText>
          </View>
        ))}
      </View>
      {data.profile.error ? (
        <ThemedText type="small" themeColor="textSecondary">
          {"Couldn't load the stats. "}
          <ThemedText type="smallBold" style={{ color: theme.tint }} onPress={data.profile.retry}>
            Try again
          </ThemedText>
        </ThemedText>
      ) : null}

      {actions}

      <Section title={isMe ? 'What friends can see' : 'Places'} accent="green">
        <Loadable
          state={data.saved}
          loadingLabel="Loading places..."
          errorTitle="Couldn't load these places">
          {({ results }) => {
            // My own list includes private saves; leave those out so this matches what
            // anyone else could see.
            const shown = isMe ? results.filter((item) => item.visibility !== 'private') : results;
            return shown.length ? (
              <View style={styles.list}>
                {shown.map((item) => (
                  <PlaceTile
                    key={item.id}
                    place={item.place}
                    saved={item}
                    showVisibility={isMe}
                    friendSave={isMe ? undefined : { savedPlaceId: item.id, friend: name }}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                accent="green"
                icon={{ ios: 'mappin.and.ellipse', android: 'place', web: 'place' }}
                title={isMe ? 'Nothing shared yet' : 'Nothing to see yet'}
                body={
                  isMe
                    ? 'Places you share with friends, a circle or everyone show up here. Private saves stay in your Saved tab.'
                    : "They haven't shared any places with you."
                }
              />
            );
          }}
        </Loadable>
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  names: {
    flex: 1,
    gap: Spacing.half,
  },
  stats: {
    flexDirection: 'row',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    borderCurve: 'continuous',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  list: {
    gap: Spacing.three,
  },
});
