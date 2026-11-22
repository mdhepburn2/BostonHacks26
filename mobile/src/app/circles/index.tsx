import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { getCircles } from '@/api/circles';
import type { Circle } from '@/api/types';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Loadable } from '@/components/loadable';
import { Avatar } from '@/components/person-row';
import { Screen } from '@/components/screen';
import { SignChip } from '@/components/sign-chip';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshOnFocus, useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';

/** Circles I own or belong to, A to Z, plus "New circle". Opened from Profile. */
export default function CirclesScreen() {
  const { status, user } = useAuth();
  const circles = useRequest(user ? `circles:${user.id}` : null, getCircles);
  useRefreshOnFocus(circles.refresh);

  if (!user) {
    return (
      <Screen>
        {status === 'signedOut' ? (
          <SignInPrompt title="Log in to see your circles" body="Circles are small groups of friends." />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen refreshing={circles.refreshing} onRefresh={circles.refresh}>
      <ThemedText themeColor="textSecondary">
        Small groups of friends. Share a saved place with just one circle, and make plans together.
      </ThemedText>
      <Button label="New circle" onPress={() => router.push('/circles/new')} />
      <Loadable state={circles} loadingLabel="Loading circles..." errorTitle="Couldn't load your circles">
        {({ results }) =>
          results.length ? (
            <View style={styles.list}>
              {results.map((circle) => (
                <CircleRow key={circle.id} circle={circle} mine={circle.owner.id === user.id} />
              ))}
            </View>
          ) : (
            <EmptyState
              accent="blue"
              icon={{ ios: 'person.3', android: 'groups', web: 'groups' }}
              title="No circles yet"
              body="Make one for the people you explore with most, like roommates or a brunch crew."
            />
          )
        }
      </Loadable>
    </Screen>
  );
}

function CircleRow({ circle, mine }: { circle: Circle; mine: boolean }) {
  const theme = useTheme();
  const count = circle.members.length;
  const shown = circle.members.slice(0, 4);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/circles/[id]', params: { id: String(circle.id) } })}
      accessibilityRole="button"
      accessibilityLabel={`${circle.name}, ${count} ${count === 1 ? 'member' : 'members'}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
            {circle.name}
          </ThemedText>
          {mine ? <SignChip label="Owner" background={theme.text} color={theme.background} /> : null}
        </View>
        <View style={styles.members}>
          <View style={styles.avatars}>
            {shown.map((member, i) => (
              <View
                key={member.id}
                style={[
                  styles.avatarRing,
                  { borderColor: theme.backgroundElement, marginLeft: i ? -8 : 0 },
                ]}>
                <Avatar user={member} size={24} />
              </View>
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {count === 1 ? '1 member' : `${count} members`}
          </ThemedText>
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
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 72,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
  },
  text: {
    flex: 1,
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
  },
  members: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatars: {
    flexDirection: 'row',
  },
  avatarRing: {
    borderWidth: 2,
    borderRadius: 14,
  },
});
