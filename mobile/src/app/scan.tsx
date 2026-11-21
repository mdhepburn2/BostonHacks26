import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

// Placeholder. Step 5 adds the camera; step 7 sends the photo to /api/identify/.
export default function ScanScreen() {
  const insets = useSafeAreaInsets();

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close camera"
        hitSlop={12}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
        <SymbolView
          name={{ ios: 'xmark', android: 'close', web: 'close' }}
          size={18}
          weight="bold"
          tintColor="#FFFFFF"
        />
      </Pressable>

      <View style={styles.body}>
        <View style={styles.frame} />
        <ThemedText type="smallBold" style={styles.text}>
          Camera coming soon
        </ThemedText>
        <ThemedText type="small" style={[styles.text, styles.dim]}>
          Point at a place and tap the shutter to find out what it is.
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  close: {
    alignSelf: 'flex-start',
    margin: Spacing.three,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  pressed: {
    opacity: 0.7,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
  },
  frame: {
    width: 220,
    height: 220,
    borderRadius: Spacing.four,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    marginBottom: Spacing.four,
  },
  text: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  dim: {
    opacity: 0.7,
  },
});
