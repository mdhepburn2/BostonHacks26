import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, Fonts, ThemeColor, isDisplayFont, opticalCenter } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  // Overpass sits high in its line box; centre it (see opticalCenter).
  const flat = StyleSheet.flatten([styles[type], style]);
  const nudge = isDisplayFont(flat?.fontFamily) ? opticalCenter(flat?.fontSize ?? 16) : null;

  return (
    <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style, nudge]} {...rest} />
  );
}

const styles = StyleSheet.create({
  small: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  default: {
    fontFamily: Fonts.body,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -0.7,
  },
  subtitle: {
    fontFamily: Fonts.display,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  link: {
    fontFamily: Fonts.bodyMedium,
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    fontFamily: Fonts.bodySemiBold,
    lineHeight: 30,
    fontSize: 14,
    color: Colors.light.blue,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
