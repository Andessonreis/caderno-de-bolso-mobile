import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { MAX_SYSTEM_FONT_MULTIPLIER, TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText, useTextStyle } from './AppText';

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  help?: string;
  optional?: boolean;
}

/** Campo de texto com rótulo grande sempre visível. */
export function Field({ label, help, optional, ...input }: FieldProps) {
  const textStyle = useTextStyle('body');
  return (
    <View style={styles.wrap}>
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
        accessibilityLabel={label}
        accessibilityHint={help}
        placeholderTextColor={colors.inkMuted}
        maxFontSizeMultiplier={MAX_SYSTEM_FONT_MULTIPLIER}
        {...input}
        style={[styles.input, textStyle]}
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
});
