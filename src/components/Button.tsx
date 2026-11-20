import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: Variant;
  /** "xl" é o botão grande de ação principal. */
  size?: 'md' | 'xl';
  disabled?: boolean;
  busy?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

const palette: Record<Variant, { bg: string; pressed: string; fg: string; border: string }> = {
  primary: { bg: colors.leaf, pressed: colors.leafPressed, fg: colors.onLeaf, border: colors.leaf },
  secondary: { bg: colors.surface, pressed: colors.surfaceSunk, fg: colors.leaf, border: colors.leaf },
  quiet: { bg: 'transparent', pressed: colors.surfaceSunk, fg: colors.ink, border: 'transparent' },
  danger: { bg: colors.surface, pressed: colors.dangerSoft, fg: colors.danger, border: colors.danger },
};

export function Button({ label, onPress, icon, variant = 'primary', size = 'md', disabled, busy, hint, style }: ButtonProps) {
  const p = palette[variant];
  const big = size === 'xl';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? p.pressed : p.bg,
          borderColor: p.border,
          minHeight: big ? 76 : TOUCH_MIN,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}>
      <View style={styles.row}>
        {busy ? (
          <ActivityIndicator color={p.fg} />
        ) : icon ? (
          <Icon name={icon} size={big ? 32 : 24} color={p.fg} />
        ) : null}
        <AppText variant={big ? 'heading' : 'label'} color={p.fg} style={styles.label}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 2,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  label: { textAlign: 'center', flexShrink: 1 },
});
