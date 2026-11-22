import { useLocalSearchParams } from 'expo-router';

import { EmptyState } from '@/components/empty-state';
import { FriendButton } from '@/components/friend-button';
import { ProfileView, useProfileData } from '@/components/profile-view';
import { Screen } from '@/components/screen';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { useAuth } from '@/hooks/use-auth';

/** Someone else's profile: their stats, the places they let me see, and a friend button. */
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, user } = useAuth();
  const userId = Number(id);

  if (!user) {
    return (
      <Screen>
        {status === 'signedOut' ? (
          <SignInPrompt
            accent="green"
            title="Log in to see profiles"
            body="See the places your friends share, and send friend requests."
          />
        ) : null}
      </Screen>
    );
  }

  return <UserProfile userId={userId} isMe={userId === user.id} />;
}

function UserProfile({ userId, isMe }: { userId: number; isMe: boolean }) {
  const data = useProfileData(userId);
  const profile = data.profile.data;

  if (data.profile.error?.kind === 'not_found') {
    return (
      <Screen>
        <EmptyState
          icon={{ ios: 'person.fill.questionmark', android: 'person_search', web: 'person_search' }}
          title="User not found"
          body="This account may have been deleted."
        />
      </Screen>
    );
  }

  return (
    <Screen refreshing={data.refreshing} onRefresh={data.refresh}>
      <ProfileView
        data={data}
        userId={userId}
        username={profile?.username ?? ''}
        isMe={isMe}
        actions={
          profile ? (
            <FriendButton
              // Start fresh if the profile's friendship changes underneath (e.g. after refresh).
              key={profile.friendship}
              userId={userId}
              username={profile.username}
              friendship={profile.friendship}
              onChanged={data.refresh}
            />
          ) : null
        }
      />
    </Screen>
  );
}
