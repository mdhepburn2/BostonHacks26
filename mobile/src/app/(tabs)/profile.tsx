import { StyleSheet, View } from 'react-native';

import { getProfile } from '@/api/social';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { ThemedText } from '@/components/themed-text';
import { AccentKeys, OnAccent, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';

// Step 13 adds my visible saved places, edit and settings; step 16 adds friend requests.
export default function ProfileScreen() {
  const theme = useTheme();
  const { status, user, logout } = useAuth();
  const profile = useRequest(user ? `profile:${user.id}` : null, () => getProfile(user?.id ?? 0));

  const accent = AccentKeys[(user?.id ?? 1) % AccentKeys.length];
  const counts = profile.data?.counts;
  const stats = [
    { label: 'Friends', value: counts?.friends },
    { label: 'Saved', value: counts?.saved },
    { label: 'Visited', value: counts?.visited },
  ];

  return (
    <Screen title="Profile">
      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: user ? theme[accent] : theme.blue }]}>
          <ThemedText type="subtitle" style={{ color: theme[OnAccent[user ? accent : 'blue']] }}>
            {user ? user.username.slice(0, 1).toUpperCase() : '?'}
          </ThemedText>
        </View>
        <View style={styles.names}>
          <ThemedText type="subtitle">{user ? user.username : 'Guest'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {user ? user.email || 'Logged in' : 'Not logged in'}
          </ThemedText>
        </View>
      </View>

      {user ? (
        <>
          <View style={[styles.stats, { backgroundColor: theme.backgroundElement }]}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.stat}>
                <ThemedText type="subtitle">{stat.value ?? '–'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {stat.label}
                </ThemedText>
              </View>
            ))}
          </View>
          {profile.error ? (
            <ThemedText type="small" themeColor="textSecondary">
              {"Couldn't load your stats. "}
              <ThemedText type="smallBold" style={{ color: theme.tint }} onPress={profile.retry}>
                Try again
              </ThemedText>
            </ThemedText>
          ) : null}
          <Button variant="plain" label="Log out" onPress={logout} />
        </>
      ) : status === 'signedOut' ? (
        <SignInPrompt
          accent="green"
          title="Log in to see your profile"
          body="This is what other people see when they look you up: your stats and the places you've shared."
        />
      ) : null}
    </Screen>
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
  names: {
    gap: Spacing.half,
  },
  stats: {
    flexDirection: 'row',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.four,
    borderCurve: 'continuous',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
});
