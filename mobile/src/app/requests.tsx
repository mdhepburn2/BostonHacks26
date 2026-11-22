import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { acceptFriendRequest, declineFriendRequest, getFriendRequests } from '@/api/social';
import type { FriendRequest } from '@/api/types';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Loadable } from '@/components/loadable';
import { Avatar } from '@/components/person-row';
import { Screen } from '@/components/screen';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshOnFocus, useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';

/** Pending friend requests sent to me, with Accept and Decline. Opened from Profile. */
export default function RequestsScreen() {
  const { status, user } = useAuth();
  const requests = useRequest(user ? `requests:${user.id}` : null, getFriendRequests);
  useRefreshOnFocus(requests.refresh);

  return (
    <Screen refreshing={requests.refreshing} onRefresh={user ? requests.refresh : undefined}>
      {user ? (
        <Loadable
          state={requests}
          loadingLabel="Loading requests..."
          errorTitle="Couldn't load your friend requests">
          {({ results }) =>
            results.length ? (
              <View style={styles.list}>
                {results.map((req) => (
                  <RequestRow key={req.id} request={req} />
                ))}
              </View>
            ) : (
              <EmptyState
                accent="green"
                icon={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
                title="No friend requests"
                body="When someone adds you, they'll show up here."
                action={
                  <Button
                    label="Find friends"
                    onPress={() =>
                      router.navigate({ pathname: '/search', params: { mode: 'people' } })
                    }
                  />
                }
              />
            )
          }
        </Loadable>
      ) : status === 'signedOut' ? (
        <SignInPrompt title="Log in to see friend requests" body="People who add you show up here." />
      ) : null}
    </Screen>
  );
}

type Outcome = 'accepted' | 'declined';

/** One request. Stays in the list after answering (with the outcome) until the next reload. */
function RequestRow({ request }: { request: FriendRequest }) {
  const theme = useTheme();
  const [busy, setBusy] = useState<Outcome | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const from = request.from_user;

  const answer = async (choice: Outcome) => {
    setBusy(choice);
    setError(null);
    try {
      await (choice === 'accepted' ? acceptFriendRequest : declineFriendRequest)(request.id);
      setOutcome(choice);
    } catch (err) {
      // 404: they cancelled it, or it was answered somewhere else.
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(from.id) } })}
        accessibilityRole="button"
        accessibilityLabel={`Open ${from.username}'s profile`}
        style={({ pressed }) => [styles.who, pressed && styles.pressed]}>
        <Avatar user={from} size={40} />
        <View style={styles.text}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {from.username}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {outcome === 'accepted'
              ? 'You are now friends'
              : outcome === 'declined'
                ? 'Declined'
                : 'Wants to be friends'}
          </ThemedText>
        </View>
      </Pressable>

      {outcome ? null : (
        <View style={styles.actions}>
          <Button
            size="small"
            variant="plain"
            label="Decline"
            onPress={() => answer('declined')}
            loading={busy === 'declined'}
            disabled={busy !== null}
          />
          <Button
            size="small"
            label="Accept"
            onPress={() => answer('accepted')}
            loading={busy === 'accepted'}
            disabled={busy !== null}
          />
        </View>
      )}

      {error ? (
        <ThemedText type="small" style={[styles.error, { color: theme.tint }]}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
  },
  who: {
    flex: 1,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  error: {
    width: '100%',
  },
  pressed: {
    opacity: 0.6,
  },
});
