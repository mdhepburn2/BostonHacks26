import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  /** "primary" is the red action button; "plain" is a text link in the tint colour. */
  variant?: 'primary' | 'plain';
  loading?: boolean;
  disabled?: boolean;
  /** "small" fits inline in a row, e.g. Accept / Decline. */
  size?: 'regular' | 'small';
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  size = 'regular',
}: ButtonProps) {
  const theme = useTheme();
  const primary = variant === 'primary';
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'small' && styles.small,
        primary && [styles.primary, { backgroundColor: theme.tint }],
        { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? theme.onTint : theme.tint} />
      ) : (
        <ThemedText type="smallBold" style={{ color: primary ? theme.onTint : theme.tint }}>
          {label}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  small: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
  },
  primary: {
    borderRadius: 24,
  },
});
