import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  addCircleMember,
  deleteCircle,
  getCircle,
  removeCircleMember,
  updateCircle,
} from '@/api/circles';
import { ApiError } from '@/api/client';
import { getFriends } from '@/api/social';
import type { Circle, User, UserSummary } from '@/api/types';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { FriendPicker } from '@/components/friend-picker';
import { Loadable } from '@/components/loadable';
import { Avatar } from '@/components/person-row';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { SignChip } from '@/components/sign-chip';
import { SignInPrompt } from '@/components/sign-in-prompt';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshOnFocus, useRequest } from '@/hooks/use-request';
import { useTheme } from '@/hooks/use-theme';
import { showAlert } from '@/utils/alert';

const NO_ONE: ReadonlySet<number> = new Set();

/**
 * One circle: who's in it, and (for the owner) adding friends, removing members, renaming and
 * deleting. Members can leave.
 */
export default function CircleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status, user } = useAuth();

  if (!user) {
    return (
      <Screen>
        {status === 'signedOut' ? (
          <SignInPrompt title="Log in to see this circle" body="Circles are small groups of friends." />
        ) : null}
      </Screen>
    );
  }
  return <CircleDetail circleId={Number(id)} me={user} />;
}

function CircleDetail({ circleId, me }: { circleId: number; me: User }) {
  const theme = useTheme();
  const circle = useRequest(`circle:${circleId}:${me.id}`, () => getCircle(circleId));
  useRefreshOnFocus(circle.refresh);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  if (circle.error?.kind === 'not_found') {
    return (
      <Screen>
        <EmptyState
          icon={{ ios: 'person.3', android: 'groups', web: 'groups' }}
          title="Circle not found"
          body="It may have been deleted, or you're no longer in it."
        />
      </Screen>
    );
  }

  /** Runs one change, shows any error, and reloads the circle either way. True if it worked. */
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    let ok = true;
    try {
      await action();
    } catch (err) {
      ok = false;
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
    circle.refresh();
    return ok;
  };

  return (
    <Screen refreshing={circle.refreshing} onRefresh={circle.refresh}>
      <Loadable state={circle} loadingLabel="Loading circle..." errorTitle="Couldn't load this circle">
        {(data) => {
          const isOwner = data.owner.id === me.id;

          const confirmRemove = (member: UserSummary) =>
            showAlert(`Remove ${member.username}?`, `They won't see places shared with ${data.name} anymore.`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => void run(() => removeCircleMember(data.id, member.id)),
              },
            ]);

          const confirmLeave = () =>
            showAlert(`Leave ${data.name}?`, "You won't see places shared with it anymore.", [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Leave',
                style: 'destructive',
                onPress: () =>
                  void (async () => {
                    setLeaving(true);
                    setError(null);
                    try {
                      await removeCircleMember(data.id, me.id);
                      router.back();
                    } catch (err) {
                      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
                      setLeaving(false);
                    }
                  })(),
              },
            ]);

          const confirmDelete = () =>
            showAlert(
              `Delete ${data.name}?`,
              'Places shared with this circle will only be visible to whoever saved them. This can’t be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () =>
                    void (async () => {
                      setLeaving(true);
                      setError(null);
                      try {
                        await deleteCircle(data.id);
                        router.back();
                      } catch (err) {
                        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
                        setLeaving(false);
                      }
                    })(),
                },
              ],
            );

          return (
            <>
              <Stack.Screen options={{ title: data.name }} />

              <CircleHeader
                // Start the edit form from the latest name after each save.
                key={`${data.name}\n${data.description}`}
                circle={data}
                canEdit={isOwner}
                onSave={(changes) => run(() => updateCircle(data.id, changes))}
              />

              <Section title={`Members · ${data.members.length}`} accent="blue">
                <View style={styles.list}>
                  {data.members.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isMe={member.id === me.id}
                      isOwner={member.role === 'owner'}
                      onRemove={isOwner && member.id !== me.id ? () => confirmRemove(member) : undefined}
                    />
                  ))}
                </View>
              </Section>

              {isOwner ? (
                <AddFriends circle={data} me={me} onAdd={(friend) => run(() => addCircleMember(data.id, friend.id))} />
              ) : null}

              {error ? (
                <ThemedText type="small" style={{ color: theme.tint }} accessibilityLiveRegion="polite">
                  {error}
                </ThemedText>
              ) : null}

              <View style={styles.footer}>
                <Button
                  variant="plain"
                  label={isOwner ? 'Delete circle' : 'Leave circle'}
                  onPress={isOwner ? confirmDelete : confirmLeave}
                  loading={leaving}
                />
              </View>
            </>
          );
        }}
      </Loadable>
    </Screen>
  );
}

type CircleHeaderProps = {
  circle: Circle;
  canEdit: boolean;
  /** Resolves true once saved; the form stays open if it failed. */
  onSave: (changes: { name: string; description: string }) => Promise<boolean>;
};

/** Description, plus an inline rename / re-describe form for the owner. */
function CircleHeader({ circle, canEdit, onSave }: CircleHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(circle.name);
  const [description, setDescription] = useState(circle.description);
  const [saving, setSaving] = useState(false);

  if (editing) {
    const save = async () => {
      setSaving(true);
      const saved = await onSave({ name: name.trim(), description: description.trim() });
      setSaving(false);
      if (saved) setEditing(false);
    };
    return (
      <View style={styles.edit}>
        <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={100} />
        <TextField
          label="Description"
          value={description}
          onChangeText={setDescription}
          autoCorrect
          multiline
          maxLength={2000}
        />
        <View style={styles.editActions}>
          <Button
            variant="plain"
            label="Cancel"
            onPress={() => {
              setName(circle.name);
              setDescription(circle.description);
              setEditing(false);
            }}
          />
          <Button label="Save" size="small" onPress={() => void save()} loading={saving} disabled={!name.trim()} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <ThemedText themeColor={circle.description ? 'text' : 'textSecondary'} style={styles.description}>
        {circle.description || (canEdit ? 'No description yet.' : `Made by ${circle.owner.username}.`)}
      </ThemedText>
      {canEdit ? <Button variant="plain" size="small" label="Edit" onPress={() => setEditing(true)} /> : null}
    </View>
  );
}

type MemberRowProps = {
  member: UserSummary;
  isMe: boolean;
  isOwner: boolean;
  onRemove?: () => void;
};

function MemberRow({ member, isMe, isOwner, onRemove }: MemberRowProps) {
  const theme = useTheme();
  return (
    <View style={[styles.member, { backgroundColor: theme.backgroundElement }]}>
      <Pressable
        onPress={() => router.push({ pathname: '/user/[id]', params: { id: String(member.id) } })}
        accessibilityRole="button"
        accessibilityLabel={`Open ${member.username}'s profile`}
        style={({ pressed }) => [styles.memberMain, pressed && { opacity: 0.6 }]}>
        <Avatar user={member} size={36} />
        <ThemedText type="smallBold" numberOfLines={1} style={styles.memberName}>
          {member.username}
          {isMe ? (
            <ThemedText type="small" themeColor="textSecondary">
              {' (you)'}
            </ThemedText>
          ) : null}
        </ThemedText>
        {isOwner ? <SignChip label="Owner" background={theme.text} color={theme.background} /> : null}
      </Pressable>
      {onRemove ? <Button variant="plain" size="small" label="Remove" onPress={onRemove} /> : null}
    </View>
  );
}

type AddFriendsProps = {
  circle: Circle;
  me: User;
  onAdd: (friend: UserSummary) => Promise<unknown>;
};

/** Friends who aren't in the circle yet. Tapping one adds them straight away. */
function AddFriends({ circle, me, onAdd }: AddFriendsProps) {
  const friends = useRequest(`friends:${me.id}`, getFriends);
  const [adding, setAdding] = useState<ReadonlySet<number>>(NO_ONE);
  const memberIds = new Set(circle.members.map((m) => m.id));

  const add = async (friend: UserSummary) => {
    setAdding((prev) => new Set(prev).add(friend.id));
    await onAdd(friend);
    setAdding((prev) => {
      const next = new Set(prev);
      next.delete(friend.id);
      return next;
    });
  };

  return (
    <Section title="Add friends" accent="green">
      <Loadable state={friends} loadingLabel="Loading friends..." errorTitle="Couldn't load your friends">
        {({ results }) => {
          const outside = results.filter((f) => !memberIds.has(f.id));
          if (outside.length) {
            return <FriendPicker friends={outside} selected={NO_ONE} busy={adding} onToggle={(f) => void add(f)} />;
          }
          return (
            <ThemedText type="small" themeColor="textSecondary">
              {results.length ? 'All your friends are in this circle.' : 'Add some friends first, then put them in circles.'}
            </ThemedText>
          );
        }}
      </Loadable>
    </Section>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  description: {
    flex: 1,
    paddingTop: Spacing.two,
  },
  edit: {
    gap: Spacing.three,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 56,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
  },
  memberMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
  },
  memberName: {
    flexShrink: 1,
  },
  footer: {
    alignItems: 'center',
  },
});
