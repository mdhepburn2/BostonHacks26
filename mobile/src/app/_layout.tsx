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
import { AlertHost } from '@/components/alert-host';
import { Colors, Fonts } from '@/constants/theme';
import { AuthProvider } from '@/hooks/use-auth';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Keep the splash screen up until the fonts are ready, so text doesn't flash in the
// system font first.
SplashScreen.preventAutoHideAsync();

// Opening a link like /place/12 directly (or refreshing it) puts the tabs underneath, so there's
// always a way back.
export const unstable_settings = { anchor: '(tabs)' };

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
    <AuthProvider>
      <ThemeProvider value={theme}>
        <Stack
          screenOptions={{
            headerTintColor: colors.tint,
            headerTitleStyle: { color: colors.text, fontFamily: Fonts.displayBold },
            headerBackTitleStyle: { fontFamily: Fonts.bodyMedium },
          }}>
          {/* The title isn't shown; it names the back button on web. */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
          <Stack.Screen name="place/[id]" options={{ title: 'Place', headerBackTitle: 'Back' }} />
          <Stack.Screen name="user/[id]" options={{ title: 'Profile', headerBackTitle: 'Back' }} />
          <Stack.Screen name="friends" options={{ title: 'Friends', headerBackTitle: 'Back' }} />
          <Stack.Screen name="circles/index" options={{ title: 'Circles', headerBackTitle: 'Back' }} />
          <Stack.Screen name="circles/[id]" options={{ title: 'Circle', headerBackTitle: 'Back' }} />
          <Stack.Screen name="circles/new" options={{ presentation: 'modal', title: '' }} />
          <Stack.Screen name="activities/index" options={{ title: 'Plans', headerBackTitle: 'Back' }} />
          <Stack.Screen name="activities/[id]" options={{ title: 'Plan', headerBackTitle: 'Back' }} />
          <Stack.Screen name="activities/new" options={{ title: '', headerBackTitle: 'Back' }} />
          <Stack.Screen
            name="requests"
            options={{ title: 'Friend requests', headerBackTitle: 'Back' }}
          />
          <Stack.Screen
            name="scan"
            options={{ presentation: 'fullScreenModal', headerShown: false }}
          />
          <Stack.Screen name="login" options={{ presentation: 'modal', title: '' }} />
          <Stack.Screen name="register" options={{ presentation: 'modal', title: '' }} />
        </Stack>
        <AlertHost />
      </ThemeProvider>
    </AuthProvider>
  );
}
