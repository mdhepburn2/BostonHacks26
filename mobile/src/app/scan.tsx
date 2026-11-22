import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Coords, IdentifyInput } from '@/api/places';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useHeading } from '@/hooks/use-heading';
import { useLocation } from '@/hooks/use-location';
import { useTheme } from '@/hooks/use-theme';

/** The API resizes to 1024px anyway, so a smaller upload is just faster. */
const PHOTO_QUALITY = 0.5;

// The camera is always on black, in light and dark mode alike.
const ON_CAMERA = '#FFFFFF';

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const [camera, requestCamera] = useCameraPermissions();
  const location = useLocation({ accuracy: 'high' });

  const cameraGranted = camera?.granted ?? false;
  const locationGranted = location.permission === 'granted';
  const checking = camera === null || location.permission === 'loading';

  let body;
  if (checking) {
    body = <View style={styles.fill} />;
  } else if (cameraGranted && locationGranted) {
    body = <Viewfinder coords={location.coords} />;
  } else {
    const blocked =
      (!cameraGranted && !camera.canAskAgain) || (!locationGranted && !location.canAskAgain);
    body = (
      <PermissionPrompt
        needsCamera={!cameraGranted}
        needsLocation={!locationGranted}
        blocked={blocked}
        onAllow={async () => {
          if (!cameraGranted) await requestCamera();
          if (!locationGranted) await location.requestPermission();
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {body}
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Close camera"
        hitSlop={12}
        style={({ pressed }) => [
          styles.close,
          { top: insets.top + Spacing.two },
          pressed && styles.pressed,
        ]}>
        <SymbolView
          name={{ ios: 'xmark', android: 'close', web: 'close' }}
          size={18}
          weight="bold"
          tintColor={ON_CAMERA}
        />
      </Pressable>
    </View>
  );
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Live camera with a shutter. Keeps a compass heading so the shot knows which way it faced. */
function Viewfinder({ coords }: { coords: Coords | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const heading = useHeading(true);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [shot, setShot] = useState<IdentifyInput | null>(null);

  const canShoot = ready && coords !== null && !taking;

  const takePhoto = async () => {
    if (!cameraRef.current || !coords) return;
    setTaking(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: PHOTO_QUALITY,
        shutterSound: false,
      });
      // Grab where we are and which way we're facing at the moment of the shot.
      setShot({ photoUri: photo.uri, lat: coords.lat, lng: coords.lng, heading: heading.current });
      // TODO(step 7): send `shot` to identify() and route on matched / ambiguous / not_found.
    } catch {
      // The camera wasn't ready or was torn down mid-shot; let them try again.
    } finally {
      setTaking(false);
    }
  };

  let status: string | null = null;
  if (!coords) status = 'Finding your location...';
  else if (shot) status = 'Photo taken. Identifying is coming next.';

  return (
    <View style={styles.fill}>
      {shot ? (
        <Image source={{ uri: shot.photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          animateShutter
          onCameraReady={() => setReady(true)}
        />
      )}

      <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.four }]}>
        {status ? (
          <View style={styles.pill}>
            {!coords ? <ActivityIndicator size="small" color={ON_CAMERA} /> : null}
            <ThemedText type="small" style={styles.onCamera}>
              {status}
            </ThemedText>
          </View>
        ) : null}

        {shot ? (
          <Pressable
            onPress={() => setShot(null)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.retake, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={styles.onCamera}>
              Retake
            </ThemedText>
          </Pressable>
        ) : (
          <Pressable
            onPress={takePhoto}
            disabled={!canShoot}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            accessibilityState={{ disabled: !canShoot }}
            style={({ pressed }) => [
              styles.shutter,
              !canShoot && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <View style={[styles.shutterInner, { backgroundColor: theme.tint }]}>
              {taking ? <ActivityIndicator color={ON_CAMERA} /> : null}
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

type PermissionPromptProps = {
  needsCamera: boolean;
  needsLocation: boolean;
  /** The user said no for good, so only Settings can fix it. */
  blocked: boolean;
  onAllow: () => void;
};

function PermissionPrompt({ needsCamera, needsLocation, blocked, onAllow }: PermissionPromptProps) {
  const theme = useTheme();

  let what = 'your camera and location';
  if (!needsLocation) what = 'your camera';
  else if (!needsCamera) what = 'your location';

  return (
    <View style={styles.prompt}>
      <View style={[styles.promptIcon, { backgroundColor: theme.tint }]}>
        <SymbolView
          name={{ ios: 'camera.viewfinder', android: 'photo_camera', web: 'photo_camera' }}
          size={32}
          tintColor={theme.onTint}
        />
      </View>
      <ThemedText type="subtitle" style={[styles.onCamera, styles.center]}>
        {blocked ? `Scan needs ${what}` : `Allow ${what}`}
      </ThemedText>
      <ThemedText style={[styles.onCamera, styles.dim, styles.center]}>
        {"Take a photo of a building, statue or storefront. We use where you're standing and which way you're facing to work out what it is."}
      </ThemedText>
      {blocked ? (
        <ThemedText type="small" style={[styles.onCamera, styles.dim, styles.center]}>
          Access was turned off. You can turn it back on in Settings.
        </ThemedText>
      ) : null}
      <Pressable
        onPress={blocked ? () => Linking.openSettings() : onAllow}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.promptButton,
          { backgroundColor: theme.tint },
          pressed && styles.pressed,
        ]}>
        <ThemedText type="smallBold" style={{ color: theme.onTint }}>
          {blocked ? 'Open Settings' : 'Continue'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fill: {
    flex: 1,
  },
  close: {
    position: 'absolute',
    left: Spacing.three,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: Spacing.three,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  shutter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: ON_CAMERA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retake: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  prompt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
  },
  promptIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  promptButton: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: Spacing.five,
    borderRadius: 25,
    marginTop: Spacing.two,
  },
  onCamera: {
    color: ON_CAMERA,
  },
  dim: {
    opacity: 0.75,
  },
  center: {
    textAlign: 'center',
  },
});
