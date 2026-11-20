import { Pressable, StyleSheet, View } from 'react-native';

import { type DateRange, formatRange } from '@/lib/dates';
import { TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

interface PeriodNavProps {
  kind: 'semana' | 'mes';
  range: DateRange;
  onPrev: () => void;
  onNext: () => void;
  /** Não deixa avançar para depois do período atual. */
  canNext: boolean;
}

/** "◀  17 a 23 de novembro  ▶" com botões grandes. */
export function PeriodNav({ kind, range, onPrev, onNext, canNext }: PeriodNavProps) {
  const prevLabel = kind === 'semana' ? 'Semana anterior' : 'Mês anterior';
  const nextLabel = kind === 'semana' ? 'Próxima semana' : 'Próximo mês';
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={prevLabel}
        onPress={onPrev}
        style={({ pressed }) => [styles.btn, pressed && { backgroundColor: colors.surfaceSunk }]}>
        <Icon name="chevron-left" size={34} color={colors.leaf} />
      </Pressable>
      <AppText variant="heading" center style={styles.label} accessibilityLiveRegion="polite">
        {formatRange(kind, range)}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nextLabel}
        accessibilityState={{ disabled: !canNext }}
        disabled={!canNext}
        onPress={onNext}
        style={({ pressed }) => [styles.btn, !canNext && { opacity: 0.3 }, pressed && { backgroundColor: colors.surfaceSunk }]}>
        <Icon name="chevron-right" size={34} color={colors.leaf} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: space.xs,
  },
  btn: {
    width: TOUCH_MIN,
    height: TOUCH_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  label: { flex: 1 },
});
