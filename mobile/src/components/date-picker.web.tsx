import type { DateTimePickerProps } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';

import { Fonts, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { fromIsoDate, toIsoDate } from '@/utils/dates';

/** Without a floor, typing a year would report "0002", "0020", ... on the way to "2026". */
const EARLIEST = new Date(1900, 0, 1);

/** The browser's own date input, taking the props the app passes to the phone picker. */
export function DatePicker({
  value,
  mode = 'date',
  minimumDate = EARLIEST,
  maximumDate,
  accentColor,
  disabled,
  onValueChange,
}: DateTimePickerProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  // What's typed so far, which may not be a valid date yet. Null shows `value`.
  const [draft, setDraft] = useState<string | null>(null);

  const withTime = mode === 'datetime';
  const format = withTime ? toIsoMinute : toIsoDate;
  const parse = withTime ? (text: string) => new Date(text) : fromIsoDate;

  return (
    <input
      type={withTime ? 'datetime-local' : 'date'}
      aria-label={withTime ? 'Date and time' : 'Date'}
      value={draft ?? format(value)}
      min={format(minimumDate)}
      max={maximumDate ? format(maximumDate) : undefined}
      required
      disabled={disabled}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        if (!event.target.validity.valid) return;
        const picked = parse(text);
        onValueChange?.(
          {
            nativeEvent: {
              timestamp: picked.getTime(),
              utcOffset: -picked.getTimezoneOffset(),
            },
          },
          picked,
        );
      }}
      onBlur={() => setDraft(null)}
      style={{
        boxSizing: 'border-box',
        minHeight: 44,
        padding: `0 ${Spacing.three}px`,
        border: 'none',
        borderRadius: Spacing.three,
        backgroundColor: theme.backgroundElement,
        color: theme.text,
        accentColor,
        colorScheme: scheme === 'dark' ? 'dark' : 'light',
        fontFamily: Fonts.body,
        fontSize: 16,
      }}
    />
  );
}

/** Local "YYYY-MM-DDTHH:MM", the format a datetime-local input uses. */
function toIsoMinute(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${toIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
