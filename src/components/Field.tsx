import { useRef, useState, type ComponentRef, type RefObject } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { MAX_SYSTEM_FONT_MULTIPLIER, TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText, useTextStyle } from './AppText';
import { useRevealOnFocus } from './Screen';

/** O campo de texto por dentro do `Field`, para guardar em `useRef`. */
export type FieldInput = ComponentRef<typeof TextInput>;

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  help?: string;
  optional?: boolean;
  /** Referência do campo, para outro campo conseguir passar o foco para ele. */
  inputRef?: RefObject<FieldInput | null>;
  /** Próximo campo do formulário: a tecla do teclado vira "Próximo" e leva o foco para ele. */
  next?: RefObject<FieldInput | null>;
}

/**
 * Campo de texto com rótulo grande sempre visível. Ao ganhar foco, o campo
 * sobe para cima do teclado e a borda muda de cor. A tecla de ação do teclado
 * leva ao próximo campo ou, no último, fecha o teclado.
 */
export function Field({ label, help, optional, inputRef, next, onFocus, onBlur, onSubmitEditing, ...input }: FieldProps) {
  const textStyle = useTextStyle('body');
  const wrapRef = useRef<ComponentRef<typeof View>>(null);
  const reveal = useRevealOnFocus();
  const [focused, setFocused] = useState(false);

  return (
    <View ref={wrapRef} style={styles.wrap} collapsable={false}>
      <AppText variant="label">
        {label}
        {optional ? <AppText variant="small" color={colors.inkMuted}>{'  (se quiser)'}</AppText> : null}
      </AppText>
      {help ? (
        <AppText variant="small" color={colors.inkMuted}>
          {help}
        </AppText>
      ) : null}
      <TextInput
        ref={inputRef}
        accessibilityLabel={label}
        accessibilityHint={help}
        placeholderTextColor={colors.inkMuted}
        maxFontSizeMultiplier={MAX_SYSTEM_FONT_MULTIPLIER}
        returnKeyType={input.multiline ? undefined : next ? 'next' : 'done'}
        submitBehavior={input.multiline ? undefined : next ? 'submit' : 'blurAndSubmit'}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          reveal?.(wrapRef.current);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        onSubmitEditing={(e) => {
          onSubmitEditing?.(e);
          next?.current?.focus();
        }}
        style={[styles.input, textStyle, focused && styles.inputFocused]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  input: {
    minHeight: TOUCH_MIN,
    borderWidth: 2,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  inputFocused: { borderColor: colors.leaf },
});
