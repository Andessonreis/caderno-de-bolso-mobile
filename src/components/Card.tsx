import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface CardProps {
  title?: string;
  icon?: IconName;
  children?: ReactNode;
  onPress?: () => void;
  /** Texto do link no rodapé do cartão quando ele é tocável. */
  actionLabel?: string;
  accessibilityLabel?: string;
  tone?: 'normal' | 'leaf' | 'warn';
  style?: StyleProp<ViewStyle>;
}

const tones = {
  normal: { bg: colors.surface, border: colors.line },
  leaf: { bg: colors.leafSoft, border: colors.leaf },
  warn: { bg: colors.warnSoft, border: colors.warn },
};

export function Card({ title, icon, children, onPress, actionLabel, accessibilityLabel, tone = 'normal', style }: CardProps) {
  const t = tones[tone];
  const content = (
    <>
      {title ? (
        <View style={styles.titleRow}>
          {icon ? <Icon name={icon} size={26} color={colors.leaf} /> : null}
          <AppText variant="heading" style={styles.flex}>
            {title}
          </AppText>
        </View>
      ) : null}
      {children}
      {onPress && actionLabel ? (
        <View style={styles.action}>
          <AppText variant="label" color={colors.leaf}>
            {actionLabel}
          </AppText>
          <Icon name="chevron-right" size={24} color={colors.leaf} />
        </View>
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.card, { backgroundColor: t.bg, borderColor: t.border }, style]}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.surfaceSunk : t.bg, borderColor: t.border },
        style,
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1.5, padding: space.lg, gap: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  flex: { flex: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs, minHeight: 32 },
});
