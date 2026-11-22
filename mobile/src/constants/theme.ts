/**
 * Colors, fonts and spacing for the app, in light and dark mode. Use these instead of
 * hardcoded values.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Wayfinding palette: a white page, ink text, and strong signage colours. Red is the main
// action, blue is "you" and links, yellow is plans and highlights, green is "on the way".
export const Colors = {
  light: {
    text: '#151515',
    background: '#FFFFFF',
    backgroundElement: '#F3F2EE',
    backgroundSelected: '#E7E5DF',
    textSecondary: '#5E5C57',
    tint: '#E8372B',
    onTint: '#FFFFFF',
    blue: '#2259E0',
    onBlue: '#FFFFFF',
    yellow: '#F5BE16',
    onYellow: '#151515',
    green: '#1FA35B',
    onGreen: '#FFFFFF',
    // Extra place-card colours, so a list of saved places isn't just four colours on repeat.
    orange: '#F2801F',
    onOrange: '#151515',
    purple: '#7A4FD8',
    onPurple: '#FFFFFF',
    teal: '#0F8F8C',
    onTeal: '#FFFFFF',
    pink: '#E2508F',
    onPink: '#FFFFFF',
    navy: '#1C2F5E',
    onNavy: '#FFFFFF',
    sky: '#6CC4F2',
    onSky: '#151515',
  },
  dark: {
    text: '#F5F5F2',
    background: '#111111',
    backgroundElement: '#1D1D1C',
    backgroundSelected: '#2A2A28',
    textSecondary: '#A3A19B',
    tint: '#F0493D',
    onTint: '#FFFFFF',
    blue: '#4A7BF0',
    onBlue: '#FFFFFF',
    yellow: '#F5BE16',
    onYellow: '#151515',
    green: '#2BB868',
    onGreen: '#FFFFFF',
    orange: '#F58D33',
    onOrange: '#151515',
    purple: '#8D66E6',
    onPurple: '#FFFFFF',
    teal: '#16A3A0',
    onTeal: '#FFFFFF',
    pink: '#EC6299',
    onPink: '#FFFFFF',
    navy: '#2C4380',
    onNavy: '#FFFFFF',
    sky: '#7ACCF5',
    onSky: '#151515',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** The strong colours, for things that pick one (icons, section markers, avatars). */
export const AccentKeys = ['tint', 'blue', 'yellow', 'green'] as const;
export type Accent = (typeof AccentKeys)[number];

/** Every colour a place card can be: the four sign colours plus the extra card colours. */
export type PlaceAccent = Accent | 'orange' | 'purple' | 'teal' | 'pink' | 'navy' | 'sky';

/** The text/icon colour that reads on each accent. */
export const OnAccent = {
  tint: 'onTint',
  blue: 'onBlue',
  yellow: 'onYellow',
  green: 'onGreen',
  orange: 'onOrange',
  purple: 'onPurple',
  teal: 'onTeal',
  pink: 'onPink',
  navy: 'onNavy',
  sky: 'onSky',
} as const satisfies Record<PlaceAccent, ThemeColor>;

/** Hand-picked (card colour, decorative shape colour) pairs, so every combination looks good. */
const PLACE_PALETTES: readonly { accent: PlaceAccent; shape: PlaceAccent }[] = [
  { accent: 'tint', shape: 'yellow' },
  { accent: 'blue', shape: 'green' },
  { accent: 'yellow', shape: 'tint' },
  { accent: 'green', shape: 'blue' },
  { accent: 'orange', shape: 'navy' },
  { accent: 'purple', shape: 'pink' },
  { accent: 'teal', shape: 'yellow' },
  { accent: 'pink', shape: 'orange' },
  { accent: 'navy', shape: 'sky' },
  { accent: 'sky', shape: 'tint' },
];

/** A place's colour pair (main block + decorative shape), fixed by its id so it never changes. */
export function placeAccents(id: number) {
  return PLACE_PALETTES[id % PLACE_PALETTES.length];
}

/** MBTA line colours, so "nearest T" badges match the signs people see on the street. */
const TransitLineColors = {
  red: '#DA291C',
  orange: '#ED8B00',
  green: '#00843D',
  blue: '#003DA5',
  silver: '#7C878E',
} as const;

/** Colour for a T line name like "Red", "Green Line B" or "Mattapan". */
export function transitLineColor(line: string) {
  const name = line.toLowerCase();
  if (name.includes('mattapan')) return TransitLineColors.red;
  for (const [key, color] of Object.entries(TransitLineColors)) {
    if (name.includes(key)) return color;
  }
  return TransitLineColors.silver;
}

/**
 * Overpass (road-sign lettering) for headings and labels, Inter for body text. These are
 * loaded in the root layout. Custom fonts need one family per weight, so pick the family
 * instead of setting `fontWeight`.
 */
export const Fonts = {
  display: 'Overpass_800ExtraBold',
  displayBold: 'Overpass_700Bold',
  label: 'Overpass_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  mono: Platform.select({ ios: 'ui-monospace', web: 'var(--font-mono)', default: 'monospace' }),
} as const;

/**
 * Overpass's font metrics sit its capitals about 0.1em above the middle of the line box
 * (Inter's are centred), so Overpass text in a chip, avatar or button looks a little high.
 * This nudges it down by that much without changing layout. ThemedText and SignChip apply it
 * on their own; use it for any other Overpass text in a box.
 */
export function opticalCenter(fontSize: number) {
  return { transform: [{ translateY: Math.round(fontSize * 0.1 * 2) / 2 }] };
}

export function isDisplayFont(fontFamily: unknown) {
  return typeof fontFamily === 'string' && fontFamily.startsWith('Overpass');
}

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
