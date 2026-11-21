import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STATS = [
  { label: 'Friends', value: 0 },
  { label: 'Saved', value: 0 },
  { label: 'Visited', value: 0 },
];

export default function ProfileScreen() {
  const theme = useTheme();

  return (
    <Screen title="Profile">
      <View style={styles.identity}>
        <View style={[styles.avatar, { backgroundColor: theme.tint }]}>
          <ThemedText type="subtitle" style={{ color: theme.onTint }}>
            ?
          </ThemedText>
        </View>
        <View style={styles.names}>
          <ThemedText type="subtitle">Guest</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Not logged in
          </ThemedText>
        </View>
      </View>

      <View style={[styles.stats, { backgroundColor: theme.backgroundElement }]}>
        {STATS.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <ThemedText type="subtitle">{stat.value}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {stat.label}
            </ThemedText>
          </View>
        ))}
      </View>

      <EmptyState
        icon={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}
        title="Log in to see your profile"
        body="This is what other people see when they look you up: your stats and the places you've shared."
      />
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
