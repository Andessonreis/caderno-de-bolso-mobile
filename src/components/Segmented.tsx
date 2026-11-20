import { Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText } from './AppText';

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

/** Botões lado a lado para escolher uma opção curta (ex.: Semana / Mês). */
export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [
              styles.seg,
              selected && styles.selected,
              pressed && !selected && { backgroundColor: colors.surfaceSunk },
            ]}>
            <AppText variant="label" color={selected ? colors.onLeaf : colors.ink} center>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  seg: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 90,
    minHeight: TOUCH_MIN,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.leaf,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.leaf },
});
