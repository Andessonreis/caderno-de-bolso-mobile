import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText } from './AppText';

interface SnackbarProps {
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  onHide: () => void;
  /** Tempo na tela, em milissegundos. */
  duration?: number;
}

/** Aviso no rodapé com ação opcional (ex.: "Desfazer"). */
export function Snackbar({ message, actionLabel, onAction, onHide, duration = 7000 }: SnackbarProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onHide, duration);
    return () => clearTimeout(t);
  }, [message, duration, onHide]);

  if (!message) return null;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar} accessibilityLiveRegion="assertive" accessibilityRole="alert">
        <AppText variant="label" color={colors.white} style={styles.msg}>
          {message}
        </AppText>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={() => {
              onAction();
              onHide();
            }}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}>
            <AppText variant="bodyStrong" color={colors.warnSoft}>
              {actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.md, right: space.md, bottom: space.md },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xs,
  },
  msg: { flex: 1, paddingVertical: space.sm },
  action: { minHeight: TOUCH_MIN, paddingHorizontal: space.lg, justifyContent: 'center' },
});
