import { StyleSheet, View } from 'react-native';

import { colors, space } from '@/theme';

import { AppText } from './AppText';

/** "Passo 2 de 5" com uma barra em segmentos. */
export function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Passo ${step} de ${total}`}
      accessibilityValue={{ min: 1, max: total, now: step }}
      style={styles.wrap}>
      <AppText variant="small" color={colors.inkMuted}>
        Passo {step} de {total}
      </AppText>
      <View style={styles.bar}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={[styles.seg, { backgroundColor: i < step ? colors.leaf : colors.line }]} />
        ))}
      </View>
    </View>
  );
}

/** Barra de progresso simples (0 a 1). */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  bar: { flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 8, borderRadius: 4 },
  track: { height: 14, borderRadius: 7, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.leaf, borderRadius: 7 },
});
