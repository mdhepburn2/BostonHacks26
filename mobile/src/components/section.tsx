import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { type Accent, Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SectionProps = {
  title: string;
  /** Colour of the small square marker before the title, like a transit line key. */
  accent?: Accent;
  children: ReactNode;
};

/** A titled block within a screen, e.g. "Recently saved". */
export function Section({ title, accent, children }: SectionProps) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        {accent ? <View style={[styles.marker, { backgroundColor: theme[accent] }]} /> : null}
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.title}>
          {title}
        </ThemedText>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  marker: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  title: {
    fontFamily: Fonts.label,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
