import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import type { PlaceDetail, SavedInfo, UserSummary } from '@/api/types';
import { Crosswalk } from '@/components/crosswalk';
import { Section } from '@/components/section';
import { SignChip } from '@/components/sign-chip';
import { ThemedText } from '@/components/themed-text';
import { Fonts, OnAccent, Spacing, placeAccents, transitLineColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The full place card: a big colour block with the name, then the details as
 * street-sign rows. Each place gets its own colour pair, picked from its id.
 */
type PlaceCardProps = {
  place: PlaceDetail;
  /** Shown right under the big colour block, e.g. the Save panel. */
  actions?: ReactNode;
  /** Live count after marking interest; defaults to the card's own count. */
  friendsInterested?: number;
  /** Live list of those friends; defaults to the card's own list. */
  interestedFriends?: UserSummary[];
  /** My saved place as it is now (it changes from the Save panel); defaults to the card's. */
  saved?: SavedInfo | null;
  /** Shown under the "friends want to go" row, e.g. the Interested button. */
  interest?: ReactNode;
};

export function PlaceCard({
  place,
  actions,
  friendsInterested,
  interestedFriends,
  saved: liveSaved,
  interest,
}: PlaceCardProps) {
  const theme = useTheme();
  const { accent, shape: shapeAccent } = placeAccents(place.id);
  const background = theme[accent];
  const foreground = theme[OnAccent[accent]];
  const friendCount = friendsInterested ?? place.friends_interested;
  // `?? []` / `?? ''`: an API deploy older than these fields leaves them out.
  const friends = interestedFriends ?? place.interested_friends ?? [];
  const saved = liveSaved === undefined ? place.saved : liveSaved;
  const address = splitAddress(place.address ?? '');

  return (
    <View style={styles.card}>
      <View style={[styles.hero, { backgroundColor: background }]}>
        <View style={[styles.circle, { backgroundColor: theme[shapeAccent] }]} />
        <View style={[styles.ring, { borderColor: foreground }]} />

        <View style={styles.heroTop}>
          <View style={styles.heroChips}>
            {place.price_range ? (
              <SignChip label={place.price_range} background={foreground} color={background} />
            ) : null}
            {saved?.visited ? (
              <SignChip
                label={saved.visited_at ? `Visited ${shortDate(saved.visited_at)}` : 'Visited'}
                background={foreground}
                color={background}
                icon={{ ios: 'checkmark', android: 'check', web: 'check' }}
              />
            ) : saved ? (
              <SignChip label="Want to go" background={background} color={foreground} outline />
            ) : null}
          </View>
          <SymbolView
            name={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }}
            size={28}
            tintColor={theme[OnAccent[shapeAccent]]}
          />
        </View>

        <View style={styles.heroBottom}>
          <ThemedText style={[styles.name, { color: foreground }]}>{place.name}</ThemedText>
          {place.rating !== null ? (
            <View style={styles.ratingRow}>
              <SymbolView
                name={{ ios: 'star.fill', android: 'star', web: 'star' }}
                size={16}
                tintColor={foreground}
              />
              <ThemedText type="smallBold" style={{ color: foreground }}>
                {place.rating.toFixed(1)}
                {place.rating_count !== null
                  ? ` · ${place.rating_count.toLocaleString()} reviews`
                  : ''}
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      {actions}

      {place.bio ? <ThemedText>{place.bio}</ThemedText> : null}

      <Crosswalk />

      {address ? (
        <SignRow
          icon={{ ios: 'mappin.and.ellipse', android: 'place', web: 'place' }}
          iconBackground={theme.text}
          iconColor={theme.background}
          title={address.street}
          detail={
            address.rest ? (
              <ThemedText type="small" themeColor="textSecondary">
                {address.rest}
              </ThemedText>
            ) : null
          }
          trailing={
            <SymbolView
              name={{ ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' }}
              size={16}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
          }
          onPress={() => openInMaps(place.name, place.address)}
          accessibilityLabel={`Address: ${place.address}. Opens in Maps.`}
        />
      ) : null}

      {place.nearest_t ? (
        <SignRow
          icon={{ ios: 'tram.fill', android: 'tram', web: 'tram' }}
          iconBackground={transitLineColor(place.nearest_t.lines[0] ?? '')}
          title={place.nearest_t.stop}
          detail={
            <View style={styles.lines}>
              {place.nearest_t.lines.map((line) => (
                <SignChip
                  key={line}
                  label={line.replace(/ line/i, '')}
                  background={transitLineColor(line)}
                  color="#FFFFFF"
                />
              ))}
            </View>
          }
          trailing={
            <SignChip
              label={`${place.nearest_t.walk_min} min`}
              background={theme.text}
              color={theme.background}
              icon={{ ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' }}
            />
          }
        />
      ) : null}

      <SignRow
        icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
        iconBackground={theme.tint}
        iconColor={theme.onTint}
        title={friendsLine(friendCount, friends)}
        detail={
          <ThemedText type="small" themeColor="textSecondary">
            {friendCount > 0 ? 'Plan a walk over together' : 'Be the trailblazer'}
          </ThemedText>
        }
      />
      {interest}

      {place.hours?.length ? (
        <Section title="Hours" accent="yellow">
          <Hours hours={place.hours} />
        </Section>
      ) : null}
    </View>
  );
}

/** How many names to list before "and N others". */
const MAX_NAMED_FRIENDS = 3;

/** "sam wants to go", "sam and maya want to go", "sam, maya, jo and 2 others want to go". */
function friendsLine(count: number, friends: UserSummary[]) {
  if (count === 0) return 'No friends want to go yet';
  const names = friends.map((f) => f.username);
  if (!names.length) {
    return count === 1 ? '1 friend wants to go' : `${count} friends want to go`;
  }
  const verb = count === 1 ? 'wants' : 'want';
  const shown = names.slice(0, names.length > MAX_NAMED_FRIENDS + 1 ? MAX_NAMED_FRIENDS : names.length);
  const others = Math.max(count - shown.length, 0);
  if (others > 0) {
    return `${shown.join(', ')} and ${others} ${others === 1 ? 'other' : 'others'} ${verb} to go`;
  }
  if (shown.length === 1) return `${shown[0]} ${verb} to go`;
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]} ${verb} to go`;
}

/** "139 Tremont St, Boston, MA 02111, USA" → street "139 Tremont St", rest "Boston, MA 02111". */
function splitAddress(address: string) {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  if (parts.length > 1 && /^(USA|United States)$/i.test(parts[parts.length - 1])) parts.pop();
  const [street, ...rest] = parts;
  return { street, rest: rest.join(', ') };
}

function openInMaps(name: string, address: string) {
  const query = encodeURIComponent(`${name}, ${address}`);
  let url = `https://maps.apple.com/?q=${encodeURIComponent(name)}&address=${encodeURIComponent(address)}`;
  if (process.env.EXPO_OS === 'android') url = `geo:0,0?q=${query}`;
  // Apple Maps isn't a safe bet in every browser.
  if (process.env.EXPO_OS === 'web') url = `https://www.google.com/maps/search/?api=1&query=${query}`;
  void Linking.openURL(url).catch(() => {
    // No maps app; the address is still on screen.
  });
}

/** "2026-11-15" → "Nov 15", read as a local date so it doesn't shift a day. */
function shortDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

type SignRowProps = {
  icon: SymbolViewProps['name'];
  iconBackground: string;
  iconColor?: string;
  title: string;
  detail?: ReactNode;
  trailing?: ReactNode;
  /** Makes the whole row a button, e.g. the address opens Maps. */
  onPress?: () => void;
  accessibilityLabel?: string;
};

/** One detail line: a coloured sign icon, a title and an optional detail and badge. */
function SignRow({
  icon,
  iconBackground,
  iconColor,
  title,
  detail,
  trailing,
  onPress,
  accessibilityLabel,
}: SignRowProps) {
  const content = (
    <>
      <View style={[styles.signIcon, { backgroundColor: iconBackground }]}>
        <SymbolView name={icon} size={20} tintColor={iconColor ?? '#FFFFFF'} />
      </View>
      <View style={styles.signText}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {detail}
      </View>
      {trailing}
    </>
  );

  if (!onPress) return <View style={styles.signRow}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.signRow, pressed && { opacity: 0.6 }]}>
      {content}
    </Pressable>
  );
}

function Hours({ hours }: { hours: string[] }) {
  const theme = useTheme();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  return (
    <View style={[styles.hours, { backgroundColor: theme.backgroundElement }]}>
      {hours.map((line) => {
        const [day, ...rest] = line.split(': ');
        const isToday = day === today;
        return (
          <View key={line} style={styles.hoursRow}>
            <View style={styles.hoursDay}>
              <ThemedText type={isToday ? 'smallBold' : 'small'}>{day}</ThemedText>
              {isToday ? (
                <SignChip label="Today" background={theme.yellow} color={theme.onYellow} />
              ) : null}
            </View>
            <ThemedText type={isToday ? 'smallBold' : 'small'} themeColor={isToday ? 'text' : 'textSecondary'}>
              {rest.join(': ')}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.four,
  },
  hero: {
    minHeight: 260,
    padding: Spacing.four,
    borderRadius: 28,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'space-between',
  },
  circle: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -60,
    right: -50,
  },
  ring: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    bottom: -24,
    right: 40,
    opacity: 0.35,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    flexShrink: 1,
  },
  heroBottom: {
    gap: Spacing.two,
    paddingRight: Spacing.five,
  },
  name: {
    fontFamily: Fonts.display,
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -0.8,
    paddingTop: Spacing.five,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  signRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  signIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signText: {
    flex: 1,
    gap: Spacing.one,
  },
  lines: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  hours: {
    padding: Spacing.three,
    borderRadius: Spacing.four,
    borderCurve: 'continuous',
    gap: Spacing.two,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hoursDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
