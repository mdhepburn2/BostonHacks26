import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Friendship, UserSummary } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { AccentKeys, Fonts, OnAccent, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const FRIENDSHIP_LABELS: Partial<Record<Friendship, string>> = {
  friends: 'Friends',
  request_sent: 'Request sent',
  request_received: 'Wants to be friends',
};

/** A person in a list (search results, later friends). Opens their profile. */
export function PersonRow({ user, friendship }: { user: UserSummary; friendship?: Friendship }) {
  const theme = useTheme();
  const label = friendship ? FRIENDSHIP_LABELS[friendship] : undefined;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(user.id) } })}
      accessibilityRole="button"
      accessibilityLabel={label ? `${user.username}, ${label}` : user.username}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Avatar user={user} size={40} />
      <View style={styles.text}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {user.username}
        </ThemedText>
        {label ? (
          <ThemedText
            type="small"
            style={{ color: friendship === 'request_received' ? theme.tint : theme.textSecondary }}>
            {label}
          </ThemedText>
        ) : null}
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={14}
        weight="bold"
        tintColor={theme.textSecondary}
      />
    </Pressable>
  );
}

/** Round initial in a colour picked from the user's id, so it's the same everywhere. */
export function Avatar({ user, size }: { user: UserSummary; size: number }) {
  const theme = useTheme();
  const accent = AccentKeys[user.id % AccentKeys.length];

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: theme[accent] },
      ]}>
      <ThemedText
        style={[
          styles.initial,
          { color: theme[OnAccent[accent]], fontSize: size * 0.45, lineHeight: size * 0.55 },
        ]}>
        {user.username.slice(0, 1).toUpperCase()}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontFamily: Fonts.display,
  },
});
