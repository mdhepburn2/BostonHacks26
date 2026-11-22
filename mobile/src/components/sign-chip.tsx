import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';

type SignChipProps = {
  label: string;
  background: string;
  color: string;
  icon?: SymbolViewProps['name'];
  /** Draw just an outline in `color`, ignoring `background`. */
  outline?: boolean;
};

/** A small street-sign style label, e.g. "4 MIN" or "$$". */
export function SignChip({ label, background, color, icon, outline }: SignChipProps) {
  return (
    <View
      style={[
        styles.chip,
        outline ? [styles.outline, { borderColor: color }] : { backgroundColor: background },
      ]}>
      {icon ? <SymbolView name={icon} size={12} weight="bold" tintColor={color} /> : null}
      <Text style={[styles.label, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderCurve: 'continuous',
  },
  outline: {
    borderWidth: 1.5,
    paddingVertical: 2.5,
  },
  label: {
    fontFamily: Fonts.display,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
});
