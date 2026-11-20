import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { AreasEditor } from '@/components/AreasEditor';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CropPicker } from '@/components/CropPicker';
import { Screen } from '@/components/Screen';
import type { Area } from '@/lib/types';
import { useApp } from '@/store';
import { colors, space } from '@/theme';

export default function AreasCulturas() {
  const areas = useApp((s) => s.areas);
  const crops = useApp((s) => s.crops);
  const entries = useApp((s) => s.entries);
  const addArea = useApp((s) => s.addArea);
  const renameArea = useApp((s) => s.renameArea);
  const removeArea = useApp((s) => s.removeArea);
  const setCrops = useApp((s) => s.setCrops);
  const [blocked, setBlocked] = useState<{ area: Area; count: number } | null>(null);
  const [toRemove, setToRemove] = useState<Area | null>(null);

  const askRemove = (area: Area) => {
    const count = entries.filter((e) => e.areaId === area.id).length;
    if (count > 0) setBlocked({ area, count });
    else setToRemove(area);
  };

  return (
    <Screen back title="Áreas e culturas" subtitle="As áreas e culturas aparecem como opções na hora de anotar.">
      <View style={styles.section}>
        <AppText variant="heading">Áreas da roça</AppText>
        <AreasEditor areas={areas} onAdd={addArea} onRename={renameArea} onRemove={askRemove} />
      </View>
      <View style={styles.section}>
        <AppText variant="heading">O que você planta</AppText>
        <AppText variant="small" color={colors.inkMuted}>
          Desmarcar uma cultura só tira ela da lista de anotar. O que já foi anotado continua no caderno.
        </AppText>
        <CropPicker selected={crops} onChange={setCrops} />
      </View>

      <ConfirmDialog
        visible={toRemove !== null}
        title={`Tirar ${toRemove?.name ?? ''}?`}
        message="Essa área não tem anotações. Ela sai da lista de áreas."
        confirmLabel="Sim, tirar"
        danger
        onConfirm={() => {
          if (toRemove) removeArea(toRemove.id);
          setToRemove(null);
        }}
        onCancel={() => setToRemove(null)}
      />
      <ConfirmDialog
        visible={blocked !== null}
        title="Essa área tem anotações"
        message={
          blocked
            ? `${blocked.area.name} tem ${blocked.count} ${blocked.count === 1 ? 'anotação' : 'anotações'}. Para não perder o histórico, ela não pode ser tirada. Se quiser, mude o nome.`
            : ''
        }
        confirmLabel="Entendi"
        cancelLabel={null}
        onConfirm={() => setBlocked(null)}
        onCancel={() => setBlocked(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
});
