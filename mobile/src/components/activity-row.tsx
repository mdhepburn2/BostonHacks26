import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Activity } from '@/api/types';
import { SignChip } from '@/components/sign-chip';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatTime, isPast } from '@/utils/dates';

/** One activity in a list (Activities screen, Home). Opens the activity. */
export function ActivityRow({ activity, myId }: { activity: Activity; myId: number }) {
  const theme = useTheme();
  const start = new Date(activity.starts_at);
  const past = isPast(activity.starts_at);
  const mine = activity.author.id === myId;
  const { going, interested } = activity.counts;

  const replies = [going ? `${going} going` : null, interested ? `${interested} interested` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/activities/[id]', params: { id: String(activity.id) } })
      }
      accessibilityRole="button"
      accessibilityLabel={`${activity.title} at ${activity.place.name}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : past ? 0.6 : 1 },
      ]}>
      {/* A calendar-page date block, yellow for plans (grey once it's happened). */}
      <View style={[styles.date, { backgroundColor: past ? theme.backgroundSelected : theme.yellow }]}>
        <ThemedText style={[styles.month, { color: past ? theme.textSecondary : theme.onYellow }]}>
          {start.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
        </ThemedText>
        <ThemedText style={[styles.day, { color: past ? theme.text : theme.onYellow }]}>
          {start.getDate()}
        </ThemedText>
      </View>

      <View style={styles.text}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {activity.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {start.toLocaleDateString('en-US', { weekday: 'short' })} {formatTime(start)} ·{' '}
          {activity.place.name}
        </ThemedText>
        <View style={styles.meta}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.by}>
            {mine ? 'Your plan' : `by ${activity.author.username}`}
            {replies ? ` · ${replies}` : ''}
          </ThemedText>
          {activity.my_response === 'going' ? (
            <SignChip label="Going" background={theme.green} color={theme.onGreen} />
          ) : activity.my_response === 'interested' ? (
            <SignChip label="Interested" background={theme.blue} color={theme.blue} outline />
          ) : null}
        </View>
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 80,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
  },
  date: {
    width: 52,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  month: {
    fontFamily: Fonts.display,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
  },
  day: {
    fontFamily: Fonts.displayBold,
    fontSize: 22,
    lineHeight: 26,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  by: {
    flexShrink: 1,
  },
});
