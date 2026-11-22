import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { sendFriendRequest } from '@/api/social';
import type { Friendship } from '@/api/types';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FriendButtonProps = {
  username: string;
  friendship: Friendship;
  /** Called after a request is sent or accepted, to reload the profile. */
  onChanged: () => void;
};

/**
 * Add friend / Request sent / Accept / Friends, from my side of the friendship. Accepting
 * re-sends a request, which the API turns into accepting theirs. Decline and unfriend come
 * with step 16.
 */
export function FriendButton({ username, friendship, onChanged }: FriendButtonProps) {
  const theme = useTheme();
  // What the last request here returned, until the reloaded profile catches up.
  const [local, setLocal] = useState<Friendship | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = local ?? friendship;

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await sendFriendRequest(username);
      setLocal(res.status === 'accepted' ? 'friends' : 'request_sent');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (status === 'self') return null;

  let control;
  if (status === 'friends') {
    control = (
      <View style={[styles.badge, { backgroundColor: theme.green }]}>
        <SymbolView
          name={{ ios: 'person.crop.circle.badge.checkmark', android: 'how_to_reg', web: 'how_to_reg' }}
          size={18}
          tintColor={theme.onGreen}
        />
        <ThemedText type="smallBold" style={{ color: theme.onGreen }}>
          Friends
        </ThemedText>
      </View>
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
        <Button label="Accept friend request" onPress={send} loading={sending} />
      </>
    );
  } else {
    control = <Button label="Add friend" onPress={send} loading={sending} />;
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
