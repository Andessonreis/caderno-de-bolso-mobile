import { Text, type TextProps, type TextStyle } from 'react-native';

import { useApp } from '@/store';
import { FONT_MULTIPLIER, MAX_SYSTEM_FONT_MULTIPLIER, type TextVariant, colors, typeScale } from '@/theme';

/** Multiplicador do tamanho de letra escolhido em Ajustes. */
export function useFontMultiplier(): number {
  const size = useApp((s) => s.fontSize);
  return FONT_MULTIPLIER[size];
}

/** Estilo de texto já escalado, para usar em TextInput. */
export function useTextStyle(variant: TextVariant): TextStyle {
  const m = useFontMultiplier();
  const spec = typeScale[variant];
  return { fontSize: Math.round(spec.size * m), lineHeight: Math.round(spec.lineHeight * m), fontWeight: spec.weight };
}

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
  center?: boolean;
}

export function AppText({ variant = 'body', color = colors.ink, center, style, ...rest }: AppTextProps) {
  const base = useTextStyle(variant);
  const role = variant === 'display' || variant === 'title' || variant === 'heading' ? 'header' : undefined;
  return (
    <Text
      accessibilityRole={role}
      maxFontSizeMultiplier={MAX_SYSTEM_FONT_MULTIPLIER}
      {...rest}
      style={[base, { color }, center && { textAlign: 'center' }, style]}
    />
  );
}
