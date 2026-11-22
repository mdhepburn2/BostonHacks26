import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ApiError } from '@/api/client';
import { markInterested, unmarkInterested } from '@/api/interest';
import type { PlaceDetail } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

/** A friend's saved place the card was opened from, so interest can credit it. */
export type InterestVia = { savedPlaceId: number; friend: string };

export type InterestState = {
  interested: boolean;
  friendsInterested: number;
  busy: boolean;
  error: string | null;
  toggle: () => void;
};

/**
 * Interest in a place, starting from the card and kept in sync with each response.
 * Mount it fresh per place and per login (key it), since it starts from `place`.
 */
export function useInterest(place: PlaceDetail, via?: InterestVia): InterestState {
  const [interested, setInterested] = useState(place.interested);
  const [friendsInterested, setFriendsInterested] = useState(place.friends_interested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (interested) {
        await unmarkInterested(place.id);
        setInterested(false);
        // DELETE sends no count back; my own interest never counts toward it, so it's unchanged.
      } else {
        let result;
        try {
          result = await markInterested(place.id, via?.savedPlaceId);
        } catch (err) {
          // The friend's save may have been hidden or removed since; still mark interest.
          if (!(via && err instanceof ApiError && err.kind === 'bad_request')) throw err;
          result = await markInterested(place.id);
        }
        setInterested(true);
        setFriendsInterested(result.friends_interested);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return { interested, friendsInterested, busy, error, toggle: () => void toggle() };
}

/** "Interested" pill: outlined when off, filled with a check when on. Logged out → login. */
export function InterestButton({ state }: { state: InterestState }) {
  const theme = useTheme();
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const on = signedIn && state.interested;
  const color = on ? theme.onTint : theme.tint;

  return (
    <Pressable
      onPress={signedIn ? state.toggle : () => router.push('/login')}
      disabled={state.busy}
      accessibilityRole={signedIn ? 'switch' : 'button'}
      accessibilityLabel={signedIn ? 'Interested' : 'Log in to mark interest'}
      accessibilityState={{ checked: on, busy: state.busy }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: theme.tint },
        on && { backgroundColor: theme.tint },
        { opacity: pressed ? 0.7 : 1 },
      ]}>
      {state.busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <SymbolView
          name={
            on
              ? { ios: 'checkmark', android: 'check', web: 'check' }
              : { ios: 'hand.wave.fill', android: 'waving_hand', web: 'waving_hand' }
          }
          size={14}
          weight="bold"
          tintColor={color}
        />
      )}
      <ThemedText type="smallBold" style={{ color }}>
        {on ? 'Interested' : "I'm interested"}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    borderWidth: 2,
  },
});
