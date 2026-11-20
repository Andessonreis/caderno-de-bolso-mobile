import { Pressable, StyleSheet, View } from 'react-native';

import { hapticTap } from '@/lib/device';
import { applyKey } from '@/lib/format';
import { colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

interface NumberPadProps {
  value: string;
  onChange: (value: string) => void;
  /** Texto ao lado do número, ex. "kg" ou "R$". */
  prefix?: string;
  suffix?: string;
  label: string;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'apagar'];

/** Teclado numérico grande, próprio do app (não depende do teclado do celular). */
export function NumberPad({ value, onChange, prefix, suffix, label }: NumberPadProps) {
  return (
    <View style={styles.wrap}>
      <View
        accessible
        accessibilityLabel={`${label}: ${value || 'vazio'}${suffix ? ` ${suffix}` : ''}`}
        accessibilityLiveRegion="polite"
        style={styles.display}>
        {prefix ? (
          <AppText variant="heading" color={colors.inkMuted}>
            {prefix}
          </AppText>
        ) : null}
        <AppText variant="display" style={styles.value}>
          {value || '0'}
        </AppText>
        {suffix ? (
          <AppText variant="heading" color={colors.inkMuted}>
            {suffix}
          </AppText>
        ) : null}
      </View>
      <View style={styles.grid}>
        {KEYS.map((k) => (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={k === 'apagar' ? 'Apagar último número' : k === ',' ? 'Vírgula' : k}
            onPress={() => {
              hapticTap();
              onChange(applyKey(value, k));
            }}
            style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.surfaceSunk }]}>
            {k === 'apagar' ? (
              <Icon name="backspace-outline" size={30} color={colors.ink} />
            ) : (
              <AppText variant="title">{k}</AppText>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  display: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.leaf,
    backgroundColor: colors.surface,
  },
  value: { fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  key: {
    width: '31.5%',
    flexGrow: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
});
