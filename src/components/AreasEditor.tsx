import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Area } from '@/lib/types';
import { TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Field } from './Field';
import { Icon } from './Icon';

interface AreasEditorProps {
  areas: Area[];
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  /** Pede para remover. Quem chama decide se pode. */
  onRemove: (area: Area) => void;
}

const SUGGESTIONS = ['Canteiro 1', 'Canteiro 2', 'Roça de baixo', 'Roça de cima', 'Quintal', 'Horta'];

export function AreasEditor({ areas, onAdd, onRename, onRemove }: AreasEditorProps) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const existing = new Set(areas.map((a) => a.name.trim().toLowerCase()));
  const trimmed = name.trim();
  const duplicate = existing.has(trimmed.toLowerCase());

  const add = (n: string) => {
    const v = n.trim();
    if (!v || existing.has(v.toLowerCase())) return;
    onAdd(v.slice(0, 30));
    setName('');
  };

  return (
    <View style={styles.wrap}>
      {areas.map((a) =>
        editing?.id === a.id ? (
          <View key={a.id} style={styles.editBox}>
            <Field
              label={`Novo nome para ${a.name}`}
              value={editing.name}
              onChangeText={(t) => setEditing({ id: a.id, name: t })}
              maxLength={30}
              autoFocus
            />
            <View style={styles.row}>
              <Button
                label="Salvar nome"
                icon="check"
                style={styles.flex}
                disabled={!editing.name.trim()}
                onPress={() => {
                  onRename(a.id, editing.name);
                  setEditing(null);
                }}
              />
              <Button label="Cancelar" variant="secondary" style={styles.flex} onPress={() => setEditing(null)} />
            </View>
          </View>
        ) : (
          <View key={a.id} style={styles.item}>
            <Icon name="map-marker-outline" size={26} color={colors.leaf} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {a.name}
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Mudar nome de ${a.name}`}
              onPress={() => setEditing({ id: a.id, name: a.name })}
              style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.surfaceSunk }]}>
              <Icon name="pencil-outline" size={24} color={colors.ink} />
              <AppText variant="small">Mudar</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Tirar ${a.name}`}
              onPress={() => onRemove(a)}
              style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.dangerSoft }]}>
              <Icon name="trash-can-outline" size={24} color={colors.danger} />
              <AppText variant="small" color={colors.danger}>
                Tirar
              </AppText>
            </Pressable>
          </View>
        ),
      )}

      <Field
        label="Nome da área"
        placeholder="Ex.: Canteiro 1"
        value={name}
        onChangeText={setName}
        maxLength={30}
        onSubmitEditing={() => add(name)}
        returnKeyType="done"
      />
      {duplicate && trimmed ? (
        <AppText variant="small" color={colors.danger}>
          Já existe uma área com esse nome.
        </AppText>
      ) : null}
      <Button label="Juntar esta área" icon="plus" variant="secondary" disabled={!trimmed || duplicate} onPress={() => add(name)} />

      <AppText variant="small" color={colors.inkMuted}>
        Ou toque num nome pronto:
      </AppText>
      <View style={styles.chips}>
        {SUGGESTIONS.filter((s) => !existing.has(s.toLowerCase())).map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityLabel={`Juntar área ${s}`}
            onPress={() => add(s)}
            style={({ pressed }) => [styles.chip, pressed && { backgroundColor: colors.surfaceSunk }]}>
            <Icon name="plus" size={20} color={colors.leaf} />
            <AppText variant="label">{s}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH_MIN + 8,
    paddingLeft: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  editBox: { gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceSunk },
  iconBtn: {
    minWidth: TOUCH_MIN,
    minHeight: TOUCH_MIN + 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: TOUCH_MIN,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.leaf,
    backgroundColor: colors.surface,
  },
});
