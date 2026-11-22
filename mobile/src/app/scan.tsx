import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { identify, type IdentifyInput } from '@/api/places';
import type { IdentifyResponse, PlaceSummary } from '@/api/types';
import { Button } from '@/components/button';
import { CandidateList } from '@/components/candidate-list';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Spacing } from '@/constants/theme';
import { useHeading } from '@/hooks/use-heading';
import { useLocation, type Fix } from '@/hooks/use-location';
import { useTheme } from '@/hooks/use-theme';

/** The API resizes to 1024px anyway, so a smaller upload is just faster. */
const PHOTO_QUALITY = 0.5;

/** After this long with no GPS fix, suggest checking Location Services. */
const LOCATION_HINT_MS = 10_000;

/** The API sends up to 3 candidates; the contract says to show at most 3. */
const MAX_CANDIDATES = 3;

// The camera is always on black, in light and dark mode alike.
const ON_CAMERA = '#FFFFFF';
/** The Camera app's yellow for an active zoom level. */
const ZOOM_ACTIVE = '#FFD60A';

/**
 * expo-camera's `zoom` (0 to 1) is exponential on iOS: factor = min * (max / min) ^ zoom.
 * So a pinch that doubles the finger spread should add ln(2) / ln(max / min). Phones differ,
 * so this assumes max / min of about 33x (e^3.5); the shown "2.0×" is approximate.
 */
const ZOOM_LOG_RANGE = 3.5;
/** Past this the image is mostly digital-zoom mush and hard to aim. */
const MAX_ZOOM = 0.75;

function zoomLabel(zoom: number) {
  const factor = Math.exp(zoom * ZOOM_LOG_RANGE);
  return factor < 1.05 ? '1×' : `${factor.toFixed(1)}×`;
}

function touchSpread(event: GestureResponderEvent) {
  const [a, b] = event.nativeEvent.touches;
  if (!a || !b) return null;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/** Two-finger pinch over the viewfinder, like the Camera app. One finger does nothing. */
function usePinchZoom() {
  const [zoom, setZoom] = useState(0);
  const pinch = useRef<{ spread: number; zoom: number } | null>(null);

  const handlers = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: (e: GestureResponderEvent) => e.nativeEvent.touches.length >= 2,
    onResponderTerminationRequest: () => true,
    onResponderMove: (e: GestureResponderEvent) => {
      const spread = touchSpread(e);
      if (spread === null || spread < 1) {
        pinch.current = null; // a finger lifted; start fresh when the second comes back
        return;
      }
      if (!pinch.current) {
        pinch.current = { spread, zoom };
        return;
      }
      const next = pinch.current.zoom + Math.log(spread / pinch.current.spread) / ZOOM_LOG_RANGE;
      setZoom(Math.min(MAX_ZOOM, Math.max(0, next)));
    },
    onResponderRelease: () => {
      pinch.current = null;
    },
    onResponderTerminate: () => {
      pinch.current = null;
    },
  };

  return { zoom, setZoom, handlers };
}

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
function Viewfinder({ coords }: { coords: Fix | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const heading = useHeading(true);
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [scan, setScan] = useState<ScanState>({ step: 'live' });
  const { zoom, setZoom, handlers: pinchHandlers } = usePinchZoom();
  // Bumped on every new request and on retake, so a late answer for an old photo is ignored.
  const requestId = useRef(0);
  // Closing the camera mid-scan must not jump to a place card when the answer arrives later.
  useEffect(
    () => () => {
      requestId.current++;
    },
    [],
  );

  const canShoot = ready && coords !== null && !taking && scan.step === 'live';

  // No fix for a while usually means Location Services are off, or the user is indoors.
  const [slowFix, setSlowFix] = useState(false);
  const hasFix = coords !== null;
  useEffect(() => {
    if (hasFix) return;
    const timer = setTimeout(() => setSlowFix(true), LOCATION_HINT_MS);
    return () => clearTimeout(timer);
  }, [hasFix]);

  const send = async (shot: IdentifyInput) => {
    const id = ++requestId.current;
    setScan({ step: 'identifying', shot });
    try {
      const result = await identify(shot);
      if (id !== requestId.current) return;
      if (result.status === 'matched' && result.place) {
        openPlace(result.place.id);
        return;
      }
      setScan({ step: 'result', shot, result });
    } catch (err) {
      if (id !== requestId.current) return;
      const error =
        err instanceof ApiError
          ? err
          : new ApiError('unavailable', 'Something went wrong. Please try again.', null);
      setScan({ step: 'error', shot, error });
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current || !coords) return;
    setTaking(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: PHOTO_QUALITY,
        shutterSound: false,
      });
      // Grab where we are and which way we're facing at the moment of the shot.
      void send({
        photoUri: photo.uri,
        lat: coords.lat,
        lng: coords.lng,
        heading: heading.current,
        accuracy: coords.accuracy,
      });
    } catch {
      // The camera wasn't ready or was torn down mid-shot; let them try again.
    } finally {
      setTaking(false);
    }
  };

  const retake = () => {
    requestId.current++;
    setScan({ step: 'live' });
  };

  const shot = scan.step === 'live' ? null : scan.shot;

  return (
    <View style={styles.fill}>
      {shot ? (
        <Image source={{ uri: shot.photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            zoom={zoom}
            animateShutter
            onCameraReady={() => setReady(true)}
          />
          {/* Catches pinches over the preview; the buttons sit on top and still get taps. */}
          <View
            style={StyleSheet.absoluteFill}
            {...pinchHandlers}
            accessible
            accessibilityLabel="Camera preview. Pinch to zoom."
          />
        </>
      )}

      {scan.step === 'result' || scan.step === 'error' ? (
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.three },
          ]}>
          {scan.step === 'result' ? (
            <ResultPanel result={scan.result} onRetake={retake} />
          ) : (
            <ErrorPanel error={scan.error} onRetry={() => send(scan.shot)} onRetake={retake} />
          )}
        </View>
      ) : (
        <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.four }]}>
          {scan.step === 'identifying' || !coords ? (
            <View style={styles.pill} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={ON_CAMERA} />
              <ThemedText type="small" style={[styles.onCamera, styles.pillText]}>
                {scan.step === 'identifying'
                  ? 'Identifying...'
                  : slowFix
                    ? "Still looking for you. Check that Location Services are on."
                    : 'Finding your location...'}
              </ThemedText>
            </View>
          ) : null}

          {scan.step === 'live' ? (
            <Pressable
              onPress={() => setZoom(zoom > 0 ? 0 : Math.log(2) / ZOOM_LOG_RANGE)}
              accessibilityRole="button"
              accessibilityLabel={zoom > 0 ? `Zoom ${zoomLabel(zoom)}. Tap to reset.` : 'Zoom to 2×'}
              hitSlop={8}
              style={({ pressed }) => [styles.zoomPill, pressed && styles.pressed]}>
              <ThemedText
                style={[styles.zoomText, { color: zoom > 0 ? ZOOM_ACTIVE : ON_CAMERA }]}>
                {zoomLabel(zoom)}
              </ThemedText>
            </Pressable>
          ) : null}

          {scan.step === 'identifying' ? (
            <Pressable
              onPress={retake}
              accessibilityRole="button"
              style={({ pressed }) => [styles.retake, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={styles.onCamera}>
                Cancel
              </ThemedText>
            </Pressable>
          ) : (
            // The Camera app's shutter: a white ring around a white disc that shrinks on press.
            <Pressable
              onPress={takePhoto}
              disabled={!canShoot}
              accessibilityRole="button"
              accessibilityLabel="Take photo"
              accessibilityState={{ disabled: !canShoot }}
              style={[styles.shutter, !canShoot && styles.disabled]}>
              {({ pressed }) => (
                <View style={[styles.shutterInner, (pressed || taking) && styles.shutterPressed]}>
                  {taking ? <ActivityIndicator color="#000000" /> : null}
                </View>
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

type ScanState =
  | { step: 'live' }
  | { step: 'identifying'; shot: IdentifyInput }
  | { step: 'result'; shot: IdentifyInput; result: IdentifyResponse }
  | { step: 'error'; shot: IdentifyInput; error: ApiError };

/** Swap the camera for the place card, so Back goes to where the user started. */
function openPlace(id: number) {
  router.replace({ pathname: '/place/[id]', params: { id: String(id) } });
}

function searchInstead() {
  close();
  router.navigate('/search');
}

/** Up to 3 options: the best guess first, then the other candidates. */
function pickList(result: IdentifyResponse): PlaceSummary[] {
  const all = result.place ? [result.place, ...result.candidates] : result.candidates;
  const seen = new Set<number>();
  return all.filter((p) => !seen.has(p.id) && seen.add(p.id)).slice(0, MAX_CANDIDATES);
}

/** Shown for ambiguous and not_found (matched goes straight to the place card). */
function ResultPanel({ result, onRetake }: { result: IdentifyResponse; onRetake: () => void }) {
  const options = pickList(result);
  const ambiguous = result.status === 'ambiguous';

  let title = 'Is it one of these?';
  let body = 'We narrowed it down. Tap the right one.';
  if (!ambiguous) {
    title = "Couldn't tell what this is";
    body = options.length
      ? 'It might be one of these places nearby.'
      : 'Try getting closer, or point straight at the front of the place.';
  }

  return (
    <View style={styles.panel}>
      <View style={styles.panelText}>
        <ThemedText type="subtitle">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {body}
        </ThemedText>
      </View>
      {options.length ? (
        <CandidateList candidates={options} onPick={(place) => openPlace(place.id)} />
      ) : null}
      <View style={styles.panelActions}>
        <Button label="Retake photo" onPress={onRetake} />
        <Button variant="plain" label="Search by name instead" onPress={searchInstead} />
      </View>
    </View>
  );
}

type ErrorPanelProps = { error: ApiError; onRetry: () => void; onRetake: () => void };

function ErrorPanel({ error, onRetry, onRetake }: ErrorPanelProps) {
  // 400 means something about the photo or location was off; resending it won't help.
  const badInput = error.kind === 'bad_request';

  return (
    <View style={styles.panel}>
      <View style={styles.panelText}>
        <ThemedText type="subtitle">
          {badInput ? "Couldn't scan that" : "Scan isn't working right now"}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {error.message}
        </ThemedText>
      </View>
      <View style={styles.panelActions}>
        {badInput ? null : <Button label="Try again" onPress={onRetry} />}
        <Button variant={badInput ? 'primary' : 'plain'} label="Retake photo" onPress={onRetake} />
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
    maxWidth: '90%',
  },
  pillText: {
    flexShrink: 1,
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: ON_CAMERA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: ON_CAMERA,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterPressed: {
    transform: [{ scale: 0.88 }],
    opacity: 0.85,
  },
  zoomPill: {
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  zoomText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 13,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
  },
  panel: {
    gap: Spacing.three,
  },
  panelText: {
    gap: Spacing.one,
  },
  panelActions: {
    gap: Spacing.one,
    marginTop: Spacing.one,
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
