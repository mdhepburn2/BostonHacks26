import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { declineFriendRequest, getFriendRequests, sendFriendRequest, unfriend } from '@/api/social';
import type { Friendship } from '@/api/types';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FriendButtonProps = {
  userId: number;
  username: string;
  friendship: Friendship;
  /** Called after any change (sent, accepted, declined, unfriended) to reload the profile. */
  onChanged: () => void;
};

/**
 * Add friend / Request sent / Accept or Decline / Friends (tap to unfriend), from my side of
 * the friendship. Accepting re-sends a request, which the API turns into accepting theirs.
 */
export function FriendButton({ userId, username, friendship, onChanged }: FriendButtonProps) {
  const theme = useTheme();
  // What the last request here returned, until the reloaded profile catches up.
  const [local, setLocal] = useState<Friendship | null>(null);
  const [busy, setBusy] = useState<'send' | 'decline' | 'unfriend' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const status = local ?? friendship;

  /** Runs one change, shows what it led to straight away, then reloads the profile. */
  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<Friendship>) => {
    setBusy(kind);
    setError(null);
    try {
      setLocal(await action());
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const send = () =>
    run('send', async () => {
      const res = await sendFriendRequest(username);
      return res.status === 'accepted' ? 'friends' : 'request_sent';
    });

  const decline = () =>
    run('decline', async () => {
      // The profile only says they asked; find their request to get its id.
      const { results } = await getFriendRequests();
      const theirs = results.find((req) => req.from_user.id === userId);
      if (theirs) await declineFriendRequest(theirs.id);
      return 'none';
    });

  const confirmUnfriend = () =>
    Alert.alert(
      `Unfriend ${username}?`,
      "You'll stop seeing each other's friends-only places, and you'll each be removed from circles the other owns.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfriend',
          style: 'destructive',
          onPress: () =>
            void run('unfriend', async () => {
              await unfriend(userId);
              return 'none';
            }),
        },
      ],
    );

  if (status === 'self') return null;

  let control;
  if (status === 'friends') {
    control = (
      <Pressable
        onPress={confirmUnfriend}
        disabled={busy !== null}
        accessibilityRole="button"
        accessibilityLabel={`Friends with ${username}. Double tap to unfriend.`}
        style={({ pressed }) => [
          styles.badge,
          { backgroundColor: theme.green, opacity: busy || pressed ? 0.7 : 1 },
        ]}>
        <SymbolView
          name={{ ios: 'person.crop.circle.badge.checkmark', android: 'how_to_reg', web: 'how_to_reg' }}
          size={18}
          tintColor={theme.onGreen}
        />
        <ThemedText type="smallBold" style={{ color: theme.onGreen }}>
          Friends
        </ThemedText>
        <SymbolView
          name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
          size={12}
          weight="bold"
          tintColor={theme.onGreen}
        />
      </Pressable>
    );
  } else if (status === 'request_sent') {
    control = (
      <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
        <SymbolView
          name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
          size={16}
          tintColor={theme.textSecondary}
        />
        <ThemedText type="smallBold" themeColor="textSecondary">
          Request sent
        </ThemedText>
      </View>
    );
  } else if (status === 'request_received') {
    control = (
      <>
        <ThemedText type="small" themeColor="textSecondary">
          {`${username} wants to be friends.`}
        </ThemedText>
        <Button
          label="Accept friend request"
          onPress={send}
          loading={busy === 'send'}
          disabled={busy !== null}
        />
        <Button
          variant="plain"
          label="Decline"
          onPress={decline}
          loading={busy === 'decline'}
          disabled={busy !== null}
        />
      </>
    );
  } else {
    control = <Button label="Add friend" onPress={send} loading={busy === 'send'} />;
  }

  return (
    <View style={styles.wrap}>
      {control}
      {error ? (
        <ThemedText type="small" style={{ color: theme.tint }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 48,
    borderRadius: 24,
  },
});
