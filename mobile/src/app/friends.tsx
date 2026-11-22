import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getFriends } from '@/api/social';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Loadable } from '@/components/loadable';
import { PersonRow } from '@/components/person-row';
import { Screen } from '@/components/screen';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshOnFocus, useRequest } from '@/hooks/use-request';

/** My friends, A to Z. Each opens their profile (where you can unfriend). */
export default function FriendsScreen() {
  const { status, user } = useAuth();
  const friends = useRequest(user ? `friends:${user.id}` : null, getFriends);
  useRefreshOnFocus(friends.refresh);

  return (
    <Screen refreshing={friends.refreshing} onRefresh={user ? friends.refresh : undefined}>
      {user ? (
        <Loadable state={friends} loadingLabel="Loading friends..." errorTitle="Couldn't load your friends">
          {({ results }) =>
            results.length ? (
              <View style={styles.list}>
                {results.map((friend) => (
                  <PersonRow key={friend.id} user={friend} />
                ))}
              </View>
            ) : (
              <EmptyState
                accent="green"
                icon={{ ios: 'person.2', android: 'group', web: 'group' }}
                title="No friends yet"
                body="Find people by username and send them a friend request."
                action={
                  <Button
                    label="Find friends"
                    onPress={() =>
                      router.navigate({ pathname: '/search', params: { mode: 'people' } })
                    }
                  />
                }
              />
            )
          }
        </Loadable>
      ) : status === 'signedOut' ? (
        <SignInPrompt title="Log in to see your friends" body="Your friends show up here." />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
});
