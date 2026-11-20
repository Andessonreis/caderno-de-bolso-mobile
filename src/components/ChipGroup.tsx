import { Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText } from './AppText';

interface ChipGroupProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  /** Texto da opção que limpa o filtro. */
  allLabel: string;
}

/** Grupo de etiquetas para filtrar; a primeira opção mostra tudo. */
export function ChipGroup<T extends string>({ label, options, value, onChange, allLabel }: ChipGroupProps<T>) {
  const all: { value: T | undefined; label: string }[] = [{ value: undefined, label: allLabel }, ...options];
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
        {all.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value ?? '__todas'}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={({ pressed }) => [styles.chip, on && styles.on, pressed && !on && { backgroundColor: colors.surfaceSunk }]}>
              <AppText variant="label" color={on ? colors.onLeaf : colors.ink}>
                {o.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: TOUCH_MIN,
    minWidth: TOUCH_MIN,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  on: { backgroundColor: colors.leaf, borderColor: colors.leaf },
});
