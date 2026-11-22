import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, formatTime } from '@/utils/dates';

type WhenPickerProps = {
  value: Date;
  onChange: (date: Date) => void;
  disabled?: boolean;
};

/**
 * Date and time for an activity, from now on. iOS shows the compact date + time buttons;
 * Android opens the system date dialog, then the time dialog, one at a time.
 */
export function WhenPicker({ value, onChange, disabled }: WhenPickerProps) {
  const theme = useTheme();
  const [androidOpen, setAndroidOpen] = useState<'date' | 'time' | null>(null);

  return (
    <View style={styles.row}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        When
      </ThemedText>
      {Platform.OS === 'android' ? (
        <View style={styles.buttons}>
          <Button
            variant="plain"
            size="small"
            label={formatDate(value)}
            disabled={disabled}
            onPress={() => setAndroidOpen('date')}
          />
          <Button
            variant="plain"
            size="small"
            label={formatTime(value)}
            disabled={disabled}
            onPress={() => setAndroidOpen('time')}
          />
          {androidOpen ? (
            <DateTimePicker
              value={value}
              mode={androidOpen}
              minimumDate={androidOpen === 'date' ? new Date() : undefined}
              presentation="dialog"
              accentColor={theme.tint}
              onValueChange={(_, picked) => {
                setAndroidOpen(null);
                onChange(picked);
              }}
              onDismiss={() => setAndroidOpen(null)}
            />
          ) : null}
        </View>
      ) : (
        <DateTimePicker
          value={value}
          mode="datetime"
          minimumDate={new Date()}
          display="compact"
          accentColor={theme.tint}
          disabled={disabled}
          onValueChange={(_, picked) => onChange(picked)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 44,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
