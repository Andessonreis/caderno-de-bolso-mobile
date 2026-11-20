import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { AudioNote } from '@/components/AudioNote';
import { Button } from '@/components/Button';
import { ChipGroup } from '@/components/ChipGroup';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { Snackbar } from '@/components/Snackbar';
import { ACTIVITIES, capitalize } from '@/lib/catalog';
import { formatRelativeDay, today as todayISO } from '@/lib/dates';
import { deleteMediaFile, mediaUri } from '@/lib/device';
import { type HistoryFilter, filterEntries, groupByDay } from '@/lib/history';
import { describeDetails, describeWhat, inArea } from '@/lib/sentence';
import { areaNameOf } from '@/lib/summary';
import type { Entry } from '@/lib/types';
import { useApp, useAreas, useEntries } from '@/store';
import { TOUCH_MIN, colors, radius, space } from '@/theme';

/** Apaga do aparelho a foto e o recado de uma anotação apagada. */
function discardMedia(entry: Entry | null) {
  if (!entry) return;
  deleteMediaFile(entry.photo);
  deleteMediaFile(entry.audio);
}

export default function Caderno() {
  const entries = useEntries();
  const areas = useAreas();
  const crops = useApp((s) => s.crops);
  const deleteEntry = useApp((s) => s.deleteEntry);
  const restoreEntry = useApp((s) => s.restoreEntry);

  const [filter, setFilter] = useState<HistoryFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [toDelete, setToDelete] = useState<Entry | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const lastDeleted = useRef<Entry | null>(null);

  const today = todayISO();
  const filtered = useMemo(() => filterEntries(entries, filter), [entries, filter]);
  const sections = useMemo(
    () => groupByDay(filtered).map((g) => ({ title: g.date, data: g.entries })),
    [filtered],
  );
  const activeFilters = [filter.areaId, filter.crop, filter.activity].filter(Boolean).length;
  const usedCrops = useMemo(() => [...new Set([...crops, ...entries.map((e) => e.crop)])], [crops, entries]);

  const confirmDelete = () => {
    if (!toDelete) return;
    // Se a foto ainda estiver pendente de um apagamento anterior, apaga agora.
    discardMedia(lastDeleted.current);
    lastDeleted.current = deleteEntry(toDelete.id) ?? null;
    setToDelete(null);
    setSnack('Anotação apagada.');
  };

  const undo = () => {
    if (lastDeleted.current) restoreEntry(lastDeleted.current.id);
    lastDeleted.current = null;
  };

  const hideSnack = useCallback(() => {
    // Sem "Desfazer": a foto e o recado da anotação apagada saem do aparelho.
    discardMedia(lastDeleted.current);
    lastDeleted.current = null;
    setSnack(null);
  }, []);

  const header = (
    <View style={styles.header}>
      <AppText variant="title">Caderno</AppText>
      <AppText variant="body" color={colors.inkMuted}>
        Tudo o que você anotou, por dia. Toque em Mudar para corrigir.
      </AppText>
      {entries.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showFilters ? 'Esconder filtros' : 'Filtrar anotações'}
          accessibilityState={{ expanded: showFilters }}
          onPress={() => setShowFilters((v) => !v)}
          style={({ pressed }) => [styles.filterToggle, pressed && { backgroundColor: colors.surfaceSunk }]}>
          <Icon name="filter-variant" size={26} color={colors.leaf} />
          <AppText variant="label" color={colors.leaf} style={styles.flex}>
            {showFilters ? 'Esconder filtros' : 'Filtrar'}
            {activeFilters ? ` (${activeFilters} ${activeFilters === 1 ? 'ligado' : 'ligados'})` : ''}
          </AppText>
          <Icon name={showFilters ? 'chevron-up' : 'chevron-down'} size={26} color={colors.leaf} />
        </Pressable>
      ) : null}
      {showFilters ? (
        <View style={styles.filters}>
          <ChipGroup
            label="Área"
            allLabel="Todas"
            options={areas.map((a) => ({ value: a.id, label: a.name }))}
            value={filter.areaId}
            onChange={(areaId) => setFilter((f) => ({ ...f, areaId }))}
          />
          <ChipGroup
            label="Cultura"
            allLabel="Todas"
            options={usedCrops.map((c) => ({ value: c, label: capitalize(c) }))}
            value={filter.crop}
            onChange={(crop) => setFilter((f) => ({ ...f, crop }))}
          />
          <ChipGroup
            label="Atividade"
            allLabel="Todas"
            options={ACTIVITIES.map((a) => ({ value: a.kind, label: a.label }))}
            value={filter.activity}
            onChange={(activity) => setFilter((f) => ({ ...f, activity }))}
          />
          {activeFilters ? (
            <Button label="Limpar filtros" variant="quiet" icon="close" onPress={() => setFilter({})} />
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          entries.length ? (
            <EmptyState
              icon="filter-remove-outline"
              title="Nada com esses filtros"
              text="Mude ou limpe os filtros para ver outras anotações."
              actionLabel="Limpar filtros"
              onAction={() => setFilter({})}
            />
          ) : (
            <EmptyState
              icon="notebook-edit-outline"
              title="O caderno está vazio"
              text="Cada vez que você anotar uma atividade, ela aparece aqui, separada por dia."
              actionLabel="Fazer a primeira anotação"
              actionIcon="pencil-plus"
              onAction={() => router.push('/anotar')}
            />
          )
        }
        renderSectionHeader={({ section }) => (
          <AppText variant="heading" style={styles.day}>
            {formatRelativeDay(section.title, today)}
          </AppText>
        )}
        renderItem={({ item }) => {
          const areaName = areaNameOf(areas, item.areaId);
          const details = describeDetails(item);
          return (
            <View style={styles.item}>
              <View style={styles.itemTop}>
                {item.photo ? (
                  <Image source={{ uri: mediaUri(item.photo) }} style={styles.thumb} contentFit="cover" accessibilityLabel="Foto" />
                ) : null}
                <View style={styles.flex}>
                  <AppText variant="small" color={colors.inkMuted}>
                    {capitalize(inArea(areaName))}
                  </AppText>
                  <AppText variant="bodyStrong">{capitalize(describeWhat(item))}</AppText>
                  {details.length ? (
                    <AppText variant="small" color={colors.inkMuted}>
                      {capitalize(details.join('; '))}
                    </AppText>
                  ) : null}
                  <View style={[styles.badge, item.copied ? styles.badgeDone : styles.badgePending]}>
                    <Icon
                      name={item.copied ? 'check' : 'clock-outline'}
                      size={16}
                      color={item.copied ? colors.leaf : colors.warn}
                    />
                    <AppText variant="small" color={item.copied ? colors.leaf : colors.warn}>
                      {item.copied ? 'Passada para o caderno' : 'Falta passar para o caderno'}
                    </AppText>
                  </View>
                </View>
              </View>
              {item.audio ? <AudioNote file={item.audio} seconds={item.audioSeconds} /> : null}
              <View style={styles.actions}>
                <Button
                  label="Mudar"
                  icon="pencil-outline"
                  variant="secondary"
                  style={styles.flex}
                  onPress={() => router.push({ pathname: '/anotar', params: { id: item.id } })}
                />
                <Button
                  label="Apagar"
                  icon="trash-can-outline"
                  variant="danger"
                  style={styles.flex}
                  onPress={() => setToDelete(item)}
                />
              </View>
            </View>
          );
        }}
      />
      <ConfirmDialog
        visible={toDelete !== null}
        title="Apagar esta anotação?"
        message={
          toDelete
            ? `${formatRelativeDay(toDelete.date, today)}, ${inArea(areaNameOf(areas, toDelete.areaId))}: ${describeWhat(toDelete)}.`
            : ''
        }
        confirmLabel="Sim, apagar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
      <Snackbar message={snack} actionLabel="Desfazer" onAction={undo} onHide={hideSnack} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, paddingBottom: 120 },
  header: { gap: space.sm, marginBottom: space.sm },
  flex: { flex: 1 },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH_MIN,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.leaf,
    backgroundColor: colors.surface,
  },
  filters: { gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surfaceSunk },
  day: { marginTop: space.md, marginBottom: space.sm },
  item: {
    marginBottom: space.md,
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  itemTop: { flexDirection: 'row', gap: space.md },
  thumb: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.surfaceSunk },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeDone: { backgroundColor: colors.leafSoft },
  badgePending: { backgroundColor: colors.warnSoft },
  actions: { flexDirection: 'row', gap: space.sm },
});
