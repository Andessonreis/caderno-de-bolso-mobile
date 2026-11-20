import { Pressable, StyleSheet, View } from 'react-native';

import { addDays, formatLongDate } from '@/lib/dates';
import type { ISODate } from '@/lib/types';
import { TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText } from './AppText';

interface DateStepperProps {
  value: ISODate;
  onChange: (d: ISODate) => void;
  /** Data máxima permitida (normalmente hoje). */
  max: ISODate;
  label: string;
}

const STEPS: { days: number; label: string; a11y: string }[] = [
  { days: -30, label: '−1 mês', a11y: 'Voltar um mês' },
  { days: -7, label: '−1 sem.', a11y: 'Voltar uma semana' },
  { days: -1, label: '−1 dia', a11y: 'Voltar um dia' },
  { days: 1, label: '+1 dia', a11y: 'Avançar um dia' },
  { days: 7, label: '+1 sem.', a11y: 'Avançar uma semana' },
  { days: 30, label: '+1 mês', a11y: 'Avançar um mês' },
];

/** Escolher uma data só com toques, sem calendário pequeno. */
export function DateStepper({ value, onChange, max, label }: DateStepperProps) {
  return (
    <View style={styles.wrap}>
      <AppText variant="heading" center accessibilityLiveRegion="polite" accessibilityLabel={`${label}: ${formatLongDate(value)}`}>
        {formatLongDate(value)}
      </AppText>
      <View style={styles.grid}>
        {STEPS.map((s) => {
          const next = addDays(value, s.days);
          const disabled = next > max;
          return (
            <Pressable
              key={s.days}
              accessibilityRole="button"
              accessibilityLabel={s.a11y}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onChange(next)}
              style={({ pressed }) => [
                styles.btn,
                disabled && { opacity: 0.35 },
                pressed && { backgroundColor: colors.surfaceSunk },
              ]}>
              <AppText variant="label" color={colors.leaf}>
                {s.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  btn: {
    width: '31%',
    flexGrow: 1,
    minHeight: TOUCH_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.leaf,
  },
});
