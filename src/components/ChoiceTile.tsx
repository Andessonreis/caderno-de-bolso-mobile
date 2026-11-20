import { Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

interface ChoiceTileProps {
  label: string;
  sublabel?: string;
  icon?: IconName;
  selected?: boolean;
  onPress: () => void;
  /** "radio" para escolha única; "checkbox" para várias; "button" para avançar direto. */
  role?: 'radio' | 'checkbox' | 'button';
  badge?: string;
}

/** Opção grande para tocar. Usada no fluxo de anotar e nas escolhas por lista. */
export function ChoiceTile({ label, sublabel, icon, selected, onPress, role = 'radio', badge }: ChoiceTileProps) {
  const a11yState = role === 'checkbox' ? { checked: Boolean(selected) } : { selected: Boolean(selected) };
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={[label, sublabel, badge].filter(Boolean).join('. ')}
      accessibilityState={a11yState}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        selected && styles.selected,
        pressed && { backgroundColor: selected ? colors.leafSoft : colors.surfaceSunk },
      ]}>
      {icon ? (
        <View style={[styles.iconWrap, selected && { backgroundColor: colors.leaf }]}>
          <Icon name={icon} size={28} color={selected ? colors.onLeaf : colors.leaf} />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong">{label}</AppText>
        {sublabel ? (
          <AppText variant="small" color={colors.inkMuted}>
            {sublabel}
          </AppText>
        ) : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <AppText variant="small" color={colors.clay}>
            {badge}
          </AppText>
        </View>
      ) : null}
      {role === 'checkbox' ? (
        <Icon
          name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={30}
          color={selected ? colors.leaf : colors.lineStrong}
        />
      ) : role === 'radio' && selected ? (
        <Icon name="check-circle" size={30} color={colors.leaf} />
      ) : role === 'button' ? (
        <Icon name="chevron-right" size={28} color={colors.lineStrong} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TOUCH_MIN + 8,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.leafSoft,
  },
  text: { flex: 1, gap: 2 },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.claySoft,
  },
});
