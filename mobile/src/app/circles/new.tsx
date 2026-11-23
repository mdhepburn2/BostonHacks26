import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addCircleMember, createCircle } from '@/api/circles';
import { ApiError } from '@/api/client';
import { getFriends } from '@/api/social';
import type { Circle, UserSummary } from '@/api/types';
import { Button } from '@/components/button';
import { FriendPicker } from '@/components/friend-picker';
import { Loadable } from '@/components/loadable';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { showAlert } from '@/utils/alert';
import { announceCircleCreated } from '@/utils/circle-created';

/**
 * New circle: a name, an optional description, and which friends are in it. Opened from the
 * Circles screen, and from a place card's "Who can see it" to share with just a few friends.
 */
export default function NewCircleScreen() {
  const { status, user } = useAuth();
  const theme = useTheme();
  const friends = useRequest(user ? `friends:${user.id}` : null, getFriends);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) {
    return (
      <Screen title="New circle">
        {status === 'signedOut' ? (
          <SignInPrompt title="Log in to make circles" body="Circles are small groups of friends." />
        ) : null}
      </Screen>
    );
  }

  const toggle = (friend: UserSummary) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(friend.id)) next.delete(friend.id);
      else next.add(friend.id);
      return next;
    });

  const ready = name.trim().length > 0;

  const submit = async () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    let circle: Circle;
    try {
      circle = await createCircle({ name: name.trim(), description: description.trim() });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
      return;
    }

    // The circle exists now; add members one by one and report any that didn't go through.
    const failed: string[] = [];
    for (const friend of friends.data?.results ?? []) {
      if (!selected.has(friend.id)) continue;
      try {
        circle = await addCircleMember(circle.id, friend.id);
      } catch {
        failed.push(friend.username);
      }
    }

    announceCircleCreated(circle);
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/circles/[id]', params: { id: String(circle.id) } });
    if (failed.length) {
      showAlert(
        `Created ${circle.name}`,
        `Couldn't add ${failed.join(', ')}. You can try again from the circle.`,
      );
    }
  };

  return (
    <Screen title="New circle" subtitle="A small group of friends to share places and make plans with.">
      <View style={styles.fields}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Brunch crew"
          autoCapitalize="words"
          maxLength={100}
          returnKeyType="next"
        />
        <TextField
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          autoCorrect
          multiline
          maxLength={2000}
        />
      </View>

      <Section title={selected.size ? `Friends · ${selected.size}` : 'Friends'} accent="blue">
        <Loadable state={friends} loadingLabel="Loading friends..." errorTitle="Couldn't load your friends">
          {({ results }) =>
            results.length ? (
              <FriendPicker
                friends={results}
                selected={selected}
                onToggle={toggle}
                disabled={submitting}
              />
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Add some friends first, then put them in circles. You can still make the circle now
                and add people later.
              </ThemedText>
            )
          }
        </Loadable>
      </Section>

      {error ? (
        <ThemedText type="small" style={{ color: theme.tint }} accessibilityLiveRegion="polite">
          {error}
        </ThemedText>
      ) : null}

      <Button label="Create circle" onPress={() => void submit()} loading={submitting} disabled={!ready} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: Spacing.three,
  },
});
