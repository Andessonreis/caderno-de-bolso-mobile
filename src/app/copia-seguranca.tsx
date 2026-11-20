import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { parseBackup } from '@/lib/backup';
import { lastBackupDate } from '@/lib/checklist';
import { formatRelativeDay, formatShortDate, today as todayISO } from '@/lib/dates';
import {
  deletePhotoFile,
  errorMessage,
  hapticSuccess,
  photoExists,
  photoUri,
  pickTextFile,
  shareJson,
  takePhoto,
} from '@/lib/device';
import type { NotebookPhoto } from '@/lib/types';
import { exportSnapshot, newId, useApp } from '@/store';
import { colors, radius, space } from '@/theme';

function PhotoViewer({ photo, onClose }: { photo: NotebookPhoto | null; onClose: () => void }) {
  const updatePhoto = useApp((s) => s.updatePhoto);
  const removePhoto = useApp((s) => s.removePhoto);
  const [caption, setCaption] = useState(photo?.caption ?? '');
  const [confirm, setConfirm] = useState(false);

  if (!photo) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.viewer}>
        <ScrollView contentContainerStyle={styles.viewerContent} keyboardShouldPersistTaps="handled">
          <AppText variant="heading" color={colors.white}>
            Página fotografada em {formatShortDate(photo.date)}
          </AppText>
          <Image
            source={{ uri: photoUri(photo.file) }}
            style={styles.full}
            contentFit="contain"
            accessibilityLabel={photo.caption ? `Foto: ${photo.caption}` : 'Foto da página do caderno'}
          />
          <View style={styles.viewerBox}>
            <Field
              label="Legenda"
              optional
              placeholder="Ex.: páginas de outubro"
              value={caption}
              onChangeText={setCaption}
              maxLength={60}
            />
            <Button
              label="Salvar legenda"
              icon="content-save"
              variant="secondary"
              onPress={() => {
                updatePhoto(photo.id, caption);
                hapticSuccess();
              }}
            />
            <Button label="Apagar foto" icon="trash-can-outline" variant="danger" onPress={() => setConfirm(true)} />
            <Button label="Fechar" icon="close" onPress={onClose} />
          </View>
        </ScrollView>
        <ConfirmDialog
          visible={confirm}
          title="Apagar esta foto?"
          message="A foto sai do aparelho. Se ela for a única cópia daquela página, ela se perde."
          confirmLabel="Sim, apagar foto"
          danger
          onConfirm={() => {
            removePhoto(photo.id);
            deletePhotoFile(photo.file);
            setConfirm(false);
            onClose();
          }}
          onCancel={() => setConfirm(false)}
        />
      </SafeAreaView>
    </Modal>
  );
}

export default function CopiaSeguranca() {
  const photos = useApp((s) => s.photos);
  const lastExportAt = useApp((s) => s.lastExportAt);
  const addPhoto = useApp((s) => s.addPhoto);
  const markExported = useApp((s) => s.markExported);
  const importData = useApp((s) => s.importData);

  const [busy, setBusy] = useState<'camera' | 'galeria' | 'export' | 'import' | null>(null);
  const [viewing, setViewing] = useState<NotebookPhoto | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const today = todayISO();
  const last = lastBackupDate(photos, lastExportAt);

  const byDay = useMemo(() => {
    const map = new Map<string, NotebookPhoto[]>();
    for (const p of photos) map.set(p.date, [...(map.get(p.date) ?? []), p]);
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [photos]);

  const snap = async (source: 'camera' | 'galeria') => {
    setBusy(source);
    try {
      const file = await takePhoto(source, 'caderno');
      if (file) {
        addPhoto({ id: newId(), file, date: today });
        hapticSuccess();
      }
    } catch (e) {
      Alert.alert('Foto', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const doExport = async () => {
    setBusy('export');
    try {
      const data = exportSnapshot(useApp.getState(), new Date().toISOString());
      await shareJson(JSON.stringify(data, null, 1), `caderno-de-bolso-${today}`);
      markExported(today);
      hapticSuccess();
    } catch (e) {
      Alert.alert('Exportar', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const doImport = async () => {
    setConfirmImport(false);
    setBusy('import');
    try {
      const text = await pickTextFile();
      if (text === null) return;
      const result = parseBackup(text, photoExists);
      if (!result.ok) {
        Alert.alert('Importar', result.error);
        return;
      }
      importData(result.data);
      hapticSuccess();
      const lost = result.droppedPhotos
        ? ` ${result.droppedPhotos === 1 ? '1 foto de anotação não está' : `${result.droppedPhotos} fotos de anotação não estão`} neste celular e ficou de fora.`
        : '';
      Alert.alert('Importar', `Pronto! ${result.data.entries.length} anotações foram trazidas do arquivo.${lost}`);
    } catch (e) {
      Alert.alert('Importar', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      back
      title="Cópia de segurança"
      subtitle="Se o caderno molhar ou se perder, as fotos das páginas e a cópia dos dados ajudam a refazer.">
      <View style={[styles.status, last ? styles.statusOk : styles.statusWarn]}>
        <AppText variant="bodyStrong">
          {last ? `Última cópia: ${formatRelativeDay(last, today).toLowerCase()}` : 'Ainda não tem cópia'}
        </AppText>
        <AppText variant="small" color={colors.inkMuted}>
          Bom fazer pelo menos uma vez por mês, e sempre antes da visita.
        </AppText>
      </View>

      <AppText variant="heading">Fotos do caderno de papel</AppText>
      <View style={styles.row}>
        <Button
          label="Fotografar página"
          icon="camera-outline"
          style={styles.flex}
          busy={busy === 'camera'}
          disabled={busy !== null}
          onPress={() => snap('camera')}
        />
        <Button
          label="Da galeria"
          icon="image-outline"
          variant="secondary"
          style={styles.flex}
          busy={busy === 'galeria'}
          disabled={busy !== null}
          onPress={() => snap('galeria')}
        />
      </View>

      {photos.length === 0 ? (
        <EmptyState
          icon="camera-burst"
          title="Nenhuma página fotografada"
          text="Abra o caderno de campo, ponha num lugar com luz e fotografe cada página escrita. As fotos ficam guardadas aqui no app."
        />
      ) : (
        byDay.map(([date, list]) => (
          <View key={date} style={styles.day}>
            <AppText variant="label" color={colors.inkMuted}>
              {formatRelativeDay(date, today)}
            </AppText>
            <View style={styles.grid}>
              {list.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir foto${p.caption ? `: ${p.caption}` : ''}`}
                  onPress={() => setViewing(p)}
                  style={({ pressed }) => [styles.tile, pressed && { opacity: 0.8 }]}>
                  <Image source={{ uri: photoUri(p.file) }} style={styles.thumb} contentFit="cover" />
                  <AppText variant="small" numberOfLines={2} style={styles.caption}>
                    {p.caption ?? 'Sem legenda'}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
        ))
      )}

      <View style={styles.box}>
        <AppText variant="heading">Exportar meus dados</AppText>
        <AppText variant="body" color={colors.inkMuted}>
          Gera um arquivo com seus dados e anotações para guardar no WhatsApp, no e-mail ou num pen drive. As fotos não
          vão no arquivo.
        </AppText>
        <Button
          label="Exportar meus dados"
          icon="export-variant"
          busy={busy === 'export'}
          disabled={busy !== null}
          onPress={doExport}
        />
      </View>

      <View style={styles.box}>
        <AppText variant="heading">Importar</AppText>
        <AppText variant="body" color={colors.inkMuted}>
          Traz de volta um arquivo exportado antes, por exemplo num celular novo.
        </AppText>
        <Button
          label="Importar arquivo"
          icon="import"
          variant="secondary"
          busy={busy === 'import'}
          disabled={busy !== null}
          onPress={() => setConfirmImport(true)}
        />
      </View>

      <ConfirmDialog
        visible={confirmImport}
        title="Trocar os dados pelo arquivo?"
        message="Os dados e anotações que estão no app agora serão trocados pelos do arquivo. As fotos continuam. Se quiser, exporte antes."
        confirmLabel="Sim, escolher arquivo"
        onConfirm={doImport}
        onCancel={() => setConfirmImport(false)}
      />
      {viewing ? <PhotoViewer key={viewing.id} photo={viewing} onClose={() => setViewing(null)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  status: { gap: 2, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5 },
  statusOk: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  statusWarn: { borderColor: colors.warn, backgroundColor: colors.warnSoft },
  day: { gap: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    width: '48.5%',
    flexGrow: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  thumb: { width: '100%', aspectRatio: 3 / 4, backgroundColor: colors.surfaceSunk },
  caption: { padding: space.sm },
  box: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  viewer: { flex: 1, backgroundColor: colors.ink },
  viewerContent: { padding: space.lg, gap: space.lg },
  full: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md },
  viewerBox: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.paper },
});
