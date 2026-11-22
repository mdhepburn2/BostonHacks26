import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { getFriendRequests } from '@/api/social';
import type { User } from '@/api/types';
import { Button } from '@/components/button';
import { LinkRow } from '@/components/link-row';
import { ProfileView, useProfileData } from '@/components/profile-view';
import { Screen } from '@/components/screen';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshOnFocus, useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';

// My profile as other people see it, plus my friend requests, friends and circles.
export default function ProfileScreen() {
  const { status, user } = useAuth();

  if (user) return <MyProfile user={user} />;

  return <Screen title="Profile">{status === 'signedOut' ? <GuestProfile /> : null}</Screen>;
}

function MyProfile({ user }: { user: User }) {
  const { logout } = useAuth();
  const data = useProfileData(user.id);
  // Only the count is needed here; the requests screen loads its own list.
  const requests = useRequest(`requests:${user.id}`, getFriendRequests);
  useRefreshOnFocus(requests.refresh);
  const refresh = () => {
    data.refresh();
    requests.refresh();
  };

  const confirmLogout = () =>
    Alert.alert('Log out?', "You'll need your username and password to log back in.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void logout() },
    ]);

  return (
    <Screen
      title="Profile"
      refreshing={data.refreshing || requests.refreshing}
      onRefresh={refresh}>
      <ProfileView
        data={data}
        userId={user.id}
        username={user.username}
        email={user.email}
        isMe
        actions={
          <View style={styles.links}>
            <LinkRow
              icon={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
              label="Friend requests"
              badge={requests.data?.results.length}
              onPress={() => router.push('/requests')}
            />
            <LinkRow
              icon={{ ios: 'person.2', android: 'group', web: 'group' }}
              label="Friends"
              onPress={() => router.push('/friends')}
            />
            <LinkRow
              icon={{ ios: 'person.3', android: 'groups', web: 'groups' }}
              label="Circles"
              onPress={() => router.push('/circles')}
            />
          </View>
        }
      />
      <View style={styles.footer}>
        <Button variant="plain" label="Log out" onPress={confirmLogout} />
      </View>
    </Screen>
  );
}

function GuestProfile() {
  const theme = useTheme();
  return (
    <>
      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: theme.blue }]}>
          <ThemedText type="subtitle" style={{ color: theme.onBlue }}>
            ?
          </ThemedText>
        </View>
        <ThemedText type="subtitle">Guest</ThemedText>
      </View>
      <SignInPrompt
        accent="green"
        title="Log in to see your profile"
        body="This is what other people see when they look you up: your stats and the places you've shared."
      />
    </>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  links: {
    gap: Spacing.two,
  },
  footer: {
    alignItems: 'center',
  },
});
