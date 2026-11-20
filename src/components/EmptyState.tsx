import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  text: string;
  actionLabel?: string;
  actionIcon?: IconName;
  onAction?: () => void;
}

/** Tela vazia que explica o que fazer e oferece o próximo passo. */
export function EmptyState({ icon, title, text, actionLabel, actionIcon, onAction }: EmptyStateProps) {
  return (
    <View style={styles.box}>
      <View style={styles.icon}>
        <Icon name={icon} size={44} color={colors.leaf} />
      </View>
      <AppText variant="heading" center>
        {title}
      </AppText>
      <AppText variant="body" color={colors.inkMuted} center>
        {text}
      </AppText>
      {actionLabel && onAction ? (
        <Button label={actionLabel} icon={actionIcon} onPress={onAction} style={styles.button} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  icon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.leafSoft,
  },
  button: { alignSelf: 'stretch', marginTop: space.sm },
});
