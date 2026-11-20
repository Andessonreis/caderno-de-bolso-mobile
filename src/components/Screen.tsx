import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TOUCH_MIN, colors, space } from '@/theme';

import { AppText } from './AppText';
import { Icon } from './Icon';

interface ScreenProps {
  title?: string;
  subtitle?: string;
  /** Mostra o botão "Voltar". Se `onBack` não vier, volta para a tela anterior. */
  back?: boolean;
  onBack?: () => void;
  backLabel?: string;
  /** Conteúdo fixo no rodapé (botões de ação). */
  footer?: ReactNode;
  /** Algo acima do título (ex.: barra de passos). */
  top?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
}

export function BackButton({ onPress, label = 'Voltar' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.back, pressed && { backgroundColor: colors.surfaceSunk }]}>
      <Icon name="arrow-left" size={28} color={colors.leaf} />
      <AppText variant="label" color={colors.leaf}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function Screen({ title, subtitle, back, onBack, backLabel, footer, top, children, scroll = true }: ScreenProps) {
  const goBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  const header = (
    <View style={styles.header}>
      {back ? <BackButton onPress={goBack} label={backLabel} /> : null}
      {top}
      {title ? (
        <AppText variant="title" style={styles.title}>
          {title}
        </AppText>
      ) : null}
      {subtitle ? (
        <AppText variant="body" color={colors.inkMuted}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled">
            {header}
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, styles.content]}>
            {header}
            {children}
          </View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  flex: { flex: 1 },
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  header: { gap: space.sm },
  title: { marginTop: space.xs },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    minHeight: TOUCH_MIN,
    paddingRight: space.lg,
    paddingLeft: space.xs,
    borderRadius: 12,
    marginLeft: -space.xs,
  },
  footer: {
    padding: space.lg,
    paddingTop: space.md,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.paper,
  },
});
