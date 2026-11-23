import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { DatePicker } from '@/components/date-picker';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type VisitDatePromptProps = {
  /** The place being checked off, for the title. Null hides the prompt. */
  placeName: string | null;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
};

/**
 * "When did you go?" after checking a place off. Defaults to today; any past date is allowed
 * (the API rejects future ones). Android uses the system date dialog; iOS shows a calendar.
 */
export function VisitDatePrompt({ placeName, onConfirm, onCancel }: VisitDatePromptProps) {
  if (placeName === null) return null;

  if (Platform.OS === 'android') {
    return (
      <DatePicker
        value={new Date()}
        maximumDate={new Date()}
        presentation="dialog"
        positiveButton={{ label: 'Visited' }}
        onValueChange={(_, date) => onConfirm(date)}
        onDismiss={onCancel}
      />
    );
  }

  return <CalendarSheet placeName={placeName} onConfirm={onConfirm} onCancel={onCancel} />;
}

function CalendarSheet({
  placeName,
  onConfirm,
  onCancel,
}: {
  placeName: string;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(() => new Date());

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        style={styles.backdrop}
        onPress={onCancel}
        accessibilityRole="button"
        accessibilityLabel="Cancel"
      />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.three },
        ]}>
        <View style={styles.text}>
          <ThemedText type="subtitle">When did you go?</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {placeName}
          </ThemedText>
        </View>
        <DatePicker
          value={date}
          maximumDate={new Date()}
          display="inline"
          accentColor={theme.tint}
          onValueChange={(_, picked) => setDate(picked)}
        />
        <View style={styles.actions}>
          <Button label="Mark as visited" onPress={() => onConfirm(date)} />
          <Button variant="plain" label="Cancel" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: Spacing.three,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderCurve: 'continuous',
    // Centred, not full width, in a desktop browser.
    ...(Platform.OS === 'web' && { maxWidth: MaxContentWidth, marginHorizontal: 'auto' }),
  },
  text: {
    gap: Spacing.one,
  },
  actions: {
    gap: Spacing.one,
  },
});
