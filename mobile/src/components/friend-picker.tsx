import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import type { UserSummary } from '@/api/types';
import { Avatar } from '@/components/person-row';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FriendPickerProps = {
  friends: UserSummary[];
  selected: ReadonlySet<number>;
  onToggle: (friend: UserSummary) => void;
  /** Friends being added right now; their rows show as busy. */
  busy?: ReadonlySet<number>;
  disabled?: boolean;
};

/** Friends as checkbox rows, for choosing who's in a circle. */
export function FriendPicker({ friends, selected, onToggle, busy, disabled }: FriendPickerProps) {
  const theme = useTheme();

  return (
    <View style={styles.list}>
      {friends.map((friend) => {
        const checked = selected.has(friend.id);
        const pending = busy?.has(friend.id) ?? false;
        return (
          <Pressable
            key={friend.id}
            onPress={() => onToggle(friend)}
            disabled={disabled || pending}
            accessibilityRole="checkbox"
            accessibilityLabel={friend.username}
            accessibilityState={{ checked, busy: pending }}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.backgroundElement },
              (pressed || pending) && styles.pressed,
            ]}>
            <Avatar user={friend} size={36} />
            <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
              {friend.username}
            </ThemedText>
            <View
              style={[
                styles.checkbox,
                { borderColor: checked ? theme.green : theme.textSecondary },
                checked && { backgroundColor: theme.green },
              ]}>
              {checked ? (
                <SymbolView
                  name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                  size={14}
                  weight="bold"
                  tintColor={theme.onGreen}
                />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
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
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderCurve: 'continuous',
  },
  name: {
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
