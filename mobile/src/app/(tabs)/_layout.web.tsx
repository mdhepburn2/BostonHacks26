import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { WebTabButton } from '@/components/web-tab-button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Narrower than this (phones), the bar goes along the bottom like the app's. */
const WIDE = 640;

export default function TabsLayout() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;

  return (
    <Tabs style={[styles.screen, { backgroundColor: theme.background }, wide ? null : styles.barBelow]}>
      <TabList
        role="navigation"
        style={[
          styles.bar,
          { borderColor: theme.backgroundSelected },
          wide ? styles.topBar : styles.bottomBar,
        ]}>
        <TabTrigger name="index" href="/" asChild>
          <WebTabButton label="Home" icon="home" wide={wide} />
        </TabTrigger>
        <TabTrigger name="saved" href="/saved" asChild>
          <WebTabButton label="Saved" icon="bookmark" wide={wide} />
        </TabTrigger>
        <TabTrigger name="profile" href="/profile" asChild>
          <WebTabButton label="Profile" icon="account_circle" wide={wide} />
        </TabTrigger>
        <TabTrigger name="search" href="/search" asChild>
          <WebTabButton label="Search" icon="search" wide={wide} />
        </TabTrigger>
      </TabList>
      <TabSlot style={styles.content} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    flexDirection: 'column',
  },
  // The bar stays first for keyboards and screen readers; only where it's drawn changes.
  barBelow: {
    flexDirection: 'column-reverse',
  },
  // TabSlot won't shrink by default, so a long screen would overflow instead of scrolling.
  content: {
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  bar: {
    flexDirection: 'row',
  },
  topBar: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  bottomBar: {
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingVertical: Spacing.one,
  },
});
