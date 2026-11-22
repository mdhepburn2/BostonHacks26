import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  Overpass_600SemiBold,
  Overpass_700Bold,
  Overpass_800ExtraBold,
} from '@expo-google-fonts/overpass';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';

import { BASE_URL, checkHealth } from '@/api/client';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Keep the splash screen up until the fonts are ready, so text doesn't flash in the
// system font first.
SplashScreen.preventAutoHideAsync();

// Root stack: the tab bar lives in (tabs); place cards push on top of it and
// the camera opens as a full-screen modal.
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Overpass_600SemiBold,
    Overpass_700Bold,
    Overpass_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
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

  // Dev only: log whether the app can reach the API, so a wrong EXPO_PUBLIC_API_URL
  // shows up in the Metro logs right away.
  useEffect(() => {
    if (!__DEV__) return;
    checkHealth()
      .then((res) => console.log(`[api] ${BASE_URL} health: ${res.status}`))
      .catch((err: Error) => console.warn(`[api] ${BASE_URL} unreachable: ${err.message}`));
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // If a font fails to load, carry on with the system font rather than a blank screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider value={theme}>
      <Stack
        screenOptions={{
          headerTintColor: colors.tint,
          headerTitleStyle: { color: colors.text, fontFamily: Fonts.displayBold },
          headerBackTitleStyle: { fontFamily: Fonts.bodyMedium },
        }}>
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
