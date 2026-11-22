import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { removeActivityResponse, respondToActivity } from '@/api/activities';
import { ApiError } from '@/api/client';
import type { Activity, ActivityReply } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

type ActivityReplyProps = {
  activity: Activity;
  /** Called with the activity as it is after each reply, so the screen shows new counts. */
  onChange: (activity: Activity) => void;
};

const OPTIONS: { value: ActivityReply; label: string; icon: SymbolViewProps['name'] }[] = [
  {
    value: 'interested',
    label: 'Interested',
    icon: { ios: 'hand.wave.fill', android: 'waving_hand', web: 'waving_hand' },
  },
  {
    value: 'going',
    label: 'Going',
    icon: { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' },
  },
];

/** "Interested" / "Going" buttons. Tapping my current reply again takes it back. */
export function ActivityReplyButtons({ activity, onChange }: ActivityReplyProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const [busy, setBusy] = useState<ActivityReply | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reply = async (status: ActivityReply) => {
    if (busy) return;
    setBusy(status);
    setError(null);
    try {
      if (activity.my_response === status) {
        await removeActivityResponse(activity.id);
        // DELETE sends nothing back, so take my reply out of the counts here.
        onChange({
          ...activity,
          my_response: null,
          responses: activity.responses.filter((r) => r.user.id !== user?.id),
          counts: { ...activity.counts, [status]: Math.max(activity.counts[status] - 1, 0) },
        });
      } else {
        onChange(await respondToActivity(activity.id, status));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.group}>
      <View style={styles.row}>
        {OPTIONS.map((option) => {
          const on = activity.my_response === option.value;
          const accent = option.value === 'going' ? theme.green : theme.blue;
          const color = on ? (option.value === 'going' ? theme.onGreen : theme.onBlue) : accent;
          return (
            <Pressable
              key={option.value}
              onPress={() => void reply(option.value)}
              disabled={busy !== null}
              accessibilityRole="radio"
              accessibilityLabel={`${option.label}, ${activity.counts[option.value]}`}
              accessibilityState={{ checked: on, busy: busy === option.value }}
              style={({ pressed }) => [
                styles.button,
                { borderColor: accent },
                on && { backgroundColor: accent },
                { opacity: pressed ? 0.7 : 1 },
              ]}>
              {busy === option.value ? (
                <ActivityIndicator size="small" color={color} />
              ) : (
                <SymbolView
                  name={on ? { ios: 'checkmark', android: 'check', web: 'check' } : option.icon}
                  size={16}
                  weight="bold"
                  tintColor={color}
                />
              )}
              <ThemedText type="smallBold" style={{ color }}>
                {option.label}
              </ThemedText>
              <ThemedText type="small" style={{ color }}>
                {activity.counts[option.value]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <ThemedText type="small" style={{ color: theme.tint }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 2,
  },
});
