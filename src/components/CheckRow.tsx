import { Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_MIN, colors, space } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

interface CheckRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  detail?: string;
}

/** Caixa de marcar com texto grande. A linha inteira é tocável. */
export function CheckRow({ label, checked, onChange, detail }: CheckRowProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceSunk }]}>
      <Icon
        name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={32}
        color={checked ? colors.leaf : colors.lineStrong}
      />
      <View style={styles.text}>
        <AppText variant="label">{label}</AppText>
        {detail ? (
          <AppText variant="small" color={colors.inkMuted}>
            {detail}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TOUCH_MIN,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: 10,
  },
  text: { flex: 1, gap: 2 },
});
