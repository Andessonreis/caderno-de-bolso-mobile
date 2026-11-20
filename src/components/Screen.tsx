import { router, useSegments } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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

/** Qualquer coisa que saiba medir a própria posição dentro da rolagem (uma View ou um campo). */
interface Measurable {
  measureLayout: (relativeTo: never, onSuccess: (x: number, y: number) => void, onFail?: () => void) => void;
}

type Reveal = (target: Measurable | null, offset?: number) => void;

const RevealContext = createContext<Reveal | null>(null);

/** Dentro de um `KeyboardScroll`, devolve a função que rola a tela até o campo em foco. */
export function useRevealOnFocus(): Reveal | null {
  return useContext(RevealContext);
}

/**
 * Espaço que os botões do próprio celular ocupam embaixo da tela (barra de
 * navegação ou a faixa do gesto). Nas abas é zero, porque a barra de abas já
 * fica acima deles.
 */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  const inTabs = (useSegments() as string[])[0] === '(tabs)';
  return inTabs ? 0 : insets.bottom;
}

/** Diz se o teclado está aberto. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

/**
 * Rolagem para telas com campos de texto. Quando um campo ganha foco, ele sobe
 * para perto do topo da área visível, acima do teclado, com o rótulo à mostra.
 * Arrastar a tela fecha o teclado.
 */
export function KeyboardScroll({ children, ...props }: ScrollViewProps) {
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const focused = useRef<{ target: Measurable; offset: number } | null>(null);

  const scrollToFocused = useCallback(() => {
    const f = focused.current;
    const scroll = scrollRef.current;
    const inner = scroll?.getInnerViewRef();
    if (!f || !scroll || !inner) return;
    f.target.measureLayout(
      inner as never,
      (_x, y) => scroll.scrollTo({ y: Math.max(0, y - f.offset), animated: true }),
      () => undefined,
    );
  }, []);

  const reveal = useCallback<Reveal>(
    (target, offset = 12) => {
      if (!target) return;
      focused.current = { target, offset };
      // Um instante para o teclado começar a subir e a área visível encolher.
      setTimeout(scrollToFocused, 120);
    },
    [scrollToFocused],
  );

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setTimeout(scrollToFocused, 50));
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      focused.current = null;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [scrollToFocused]);

  return (
    <RevealContext.Provider value={reveal}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // O Android também tenta rolar até o campo em foco; fica só a nossa rolagem.
        scrollsChildToFocus={false}
        {...props}
        onLayout={(e) => {
          // A área visível encolhe quando o teclado termina de subir: confere o campo de novo.
          if (focused.current) scrollToFocused();
          props.onLayout?.(e);
        }}>
        {children}
      </ScrollView>
    </RevealContext.Provider>
  );
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
  const keyboardOpen = useKeyboardOpen();
  // Com o teclado aberto, ele cobre os botões do celular: não precisa do espaço extra.
  const bottomInset = useBottomInset();
  const bottom = keyboardOpen ? 0 : bottomInset;
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
      {/* 'padding' também no Android: com a tela de ponta a ponta, o sistema não encolhe a janela sozinho. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {scroll ? (
          <KeyboardScroll
            style={styles.flex}
            contentContainerStyle={[styles.content, !footer && { paddingBottom: space.xxl + bottom }]}>
            {header}
            {children}
          </KeyboardScroll>
        ) : (
          <View style={[styles.flex, styles.content, !footer && { paddingBottom: space.xxl + bottom }]}>
            {header}
            {children}
          </View>
        )}
        {footer ? (
          <View
            style={[
              styles.footer,
              keyboardOpen ? styles.footerCompact : { paddingBottom: space.lg + bottom },
            ]}>
            {footer}
          </View>
        ) : null}
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
  // Com o teclado aberto sobra pouco espaço: o rodapé fica mais baixo, mas continua ao alcance.
  footerCompact: { paddingVertical: space.sm },
});
