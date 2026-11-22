import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { FeedItem } from '@/api/types';
import { PlaceTile } from '@/components/place-tile';
import { ThemedText } from '@/components/themed-text';
import { AccentKeys, Fonts, OnAccent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** One "a friend saved this place" item in the Home feed. */
export function FriendFeedItem({ item }: { item: FeedItem }) {
  const theme = useTheme();
  const avatarAccent = AccentKeys[item.friend.id % AccentKeys.length];

  return (
    <View style={styles.item}>
      <Pressable
        onPress={() =>
          router.push({ pathname: '/user/[id]', params: { id: String(item.friend.id) } })
        }
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.friend.username}'s profile`}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <View style={[styles.avatar, { backgroundColor: theme[avatarAccent] }]}>
          <ThemedText style={[styles.initial, { color: theme[OnAccent[avatarAccent]] }]}>
            {item.friend.username.slice(0, 1).toUpperCase()}
          </ThemedText>
        </View>
        <ThemedText type="small" style={styles.text}>
          <ThemedText type="smallBold">{item.friend.username}</ThemedText>
          {item.saved.visited ? ' went here' : ' wants to go'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {timeAgo(item.feed_at)}
        </ThemedText>
      </Pressable>
      <PlaceTile place={item.saved.place} saved={item.saved} />
    </View>
  );
}

function timeAgo(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  item: {
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: Fonts.display,
    fontSize: 13,
    lineHeight: 16,
  },
  text: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
