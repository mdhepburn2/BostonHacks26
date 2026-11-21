/**
 * Colors, fonts and spacing for the app, in light and dark mode. Use these instead of
 * hardcoded values.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Warm off-whites and a brick red borrowed from the Freedom Trail line.
export const Colors = {
  light: {
    text: '#1B1A17',
    background: '#FAF7F2',
    backgroundElement: '#F0EBE3',
    backgroundSelected: '#E4DCD0',
    textSecondary: '#6B655C',
    tint: '#B5332E',
    onTint: '#FFFFFF',
  },
  dark: {
    text: '#F5F1EA',
    background: '#121110',
    backgroundElement: '#1F1D1A',
    backgroundSelected: '#2B2824',
    textSecondary: '#A8A196',
    tint: '#E0574F',
    onTint: '#FFFFFF',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
