import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { COMMON_CROPS, capitalize } from '@/lib/catalog';
import { TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Field } from './Field';
import { Icon } from './Icon';

interface CropPickerProps {
  selected: string[];
  onChange: (crops: string[]) => void;
}

/** Marcar as culturas que planta numa lista pronta, com "outra" para digitar. */
export function CropPicker({ selected, onChange }: CropPickerProps) {
  const [other, setOther] = useState('');
  const chosen = new Set(selected);
  const custom = selected.filter((c) => !COMMON_CROPS.includes(c));
  const all = [...COMMON_CROPS, ...custom];

  const toggle = (c: string) => {
    if (chosen.has(c)) onChange(selected.filter((x) => x !== c));
    else onChange([...selected, c]);
  };

  const addOther = () => {
    const v = other.trim().toLowerCase().slice(0, 30);
    if (!v) return;
    if (!chosen.has(v)) onChange([...selected, v]);
    setOther('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {all.map((c) => {
          const on = chosen.has(c);
          return (
            <Pressable
              key={c}
              accessibilityRole="checkbox"
              accessibilityLabel={capitalize(c)}
              accessibilityState={{ checked: on }}
              onPress={() => toggle(c)}
              style={({ pressed }) => [
                styles.chip,
                on && styles.chipOn,
                pressed && { opacity: 0.8 },
              ]}>
              <Icon
                name={on ? 'check-circle' : 'circle-outline'}
                size={22}
                color={on ? colors.onLeaf : colors.lineStrong}
              />
              <AppText variant="label" color={on ? colors.onLeaf : colors.ink}>
                {capitalize(c)}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <Field
        label="Outra cultura"
        placeholder="Digite o nome"
        value={other}
        onChangeText={setOther}
        maxLength={30}
        onSubmitEditing={addOther}
        returnKeyType="done"
      />
      <Button label="Juntar esta cultura" icon="plus" variant="secondary" disabled={!other.trim()} onPress={addOther} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: TOUCH_MIN,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.leaf, borderColor: colors.leaf },
});
