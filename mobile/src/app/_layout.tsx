import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Root stack: the tab bar lives in (tabs); place cards push on top of it and
// the camera opens as a full-screen modal.
export default function RootLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.tint,
      background: colors.background,
      card: colors.background,
      text: colors.text,
    },
  };

  return (
    <ThemeProvider value={theme}>
      <Stack
        screenOptions={{ headerTintColor: colors.tint, headerTitleStyle: { color: colors.text } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="place/[id]" options={{ title: 'Place', headerBackTitle: 'Back' }} />
        <Stack.Screen
          name="scan"
          options={{ presentation: 'fullScreenModal', headerShown: false }}
        />
      </Stack>
    </ThemeProvider>
  );
}
