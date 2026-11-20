import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CheckRow } from '@/components/CheckRow';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DateStepper } from '@/components/DateStepper';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ProgressBar } from '@/components/StepProgress';
import { type CheckItem, DEFAULT_PERIOD_DAYS, computeChecklist } from '@/lib/checklist';
import { addDays, formatShortDate, today as todayISO } from '@/lib/dates';
import { errorMessage, sharePdf } from '@/lib/device';
import { visitHtml } from '@/lib/html';
import { buildSummary } from '@/lib/summary';
import type { ManualCheckId } from '@/lib/types';
import { useApp } from '@/store';
import { colors, radius, space } from '@/theme';

/** Para onde mandar o produtor resolver cada item automático. */
const FIX_ROUTE: Record<string, { label: string; href: '/caderno' | '/resumos' | '/copia-seguranca' | '/anotar' }> = {
  caderno: { label: 'Abrir resumos', href: '/resumos' },
  sementes: { label: 'Abrir o caderno', href: '/caderno' },
  insumos: { label: 'Abrir o caderno', href: '/caderno' },
  'colheita-venda': { label: 'Anotar agora', href: '/anotar' },
  copia: { label: 'Fazer cópia de segurança', href: '/copia-seguranca' },
};

function AutoItem({ item }: { item: CheckItem }) {
  const fix = FIX_ROUTE[item.id];
  return (
    <View
      style={[styles.item, item.done ? styles.itemDone : styles.itemMissing]}
      accessible={!(!item.done && fix)}
      accessibilityLabel={`${item.label}: ${item.done ? 'pronto' : 'falta'}. ${item.missing ?? item.why}`}>
      <View style={styles.itemHead}>
        <Icon
          name={item.done ? 'check-circle' : 'alert-circle-outline'}
          size={30}
          color={item.done ? colors.leaf : colors.clay}
        />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{item.label}</AppText>
          <AppText variant="small" color={item.done ? colors.leaf : colors.clay}>
            {item.done ? 'Pronto' : 'Falta'} · conferido pelo app
          </AppText>
        </View>
      </View>
      {item.missing ? <AppText variant="body">{item.missing}</AppText> : null}
      <AppText variant="small" color={colors.inkMuted}>
        {item.why}
      </AppText>
      {!item.done && fix ? (
        <Button label={fix.label} variant="secondary" icon="arrow-right" onPress={() => router.push(fix.href)} />
      ) : null}
    </View>
  );
}

export default function Visita() {
  const entries = useApp((s) => s.entries);
  const areas = useApp((s) => s.areas);
  const photos = useApp((s) => s.photos);
  const profile = useApp((s) => s.profile);
  const manualChecks = useApp((s) => s.manualChecks);
  const lastVisitDate = useApp((s) => s.lastVisitDate);
  const lastExportAt = useApp((s) => s.lastExportAt);
  const setManualCheck = useApp((s) => s.setManualCheck);
  const setLastVisitDate = useApp((s) => s.setLastVisitDate);
  const resetManualChecks = useApp((s) => s.resetManualChecks);

  const today = todayISO();
  const [editingVisit, setEditingVisit] = useState(false);
  /** Data antes de começar a mudar, para saber se mudou de verdade. */
  const [dateBefore, setDateBefore] = useState<string | undefined>(undefined);
  const [askReset, setAskReset] = useState(false);
  const anyManualChecked = Object.values(manualChecks).some(Boolean);

  const finishEditing = (newDate: string | undefined) => {
    setEditingVisit(false);
    // Visita nova: os itens marcados à mão eram da visita anterior.
    if (newDate !== dateBefore && anyManualChecked) setAskReset(true);
  };
  const [busy, setBusy] = useState(false);
  const checklist = computeChecklist({ entries, photos, manual: manualChecks, lastVisitDate, lastExportAt, today });
  const autoItems = checklist.items.filter((i) => i.auto);
  const manualItems = checklist.items.filter((i) => !i.auto);
  const periodLabel = lastVisitDate
    ? `desde a última visita (${formatShortDate(lastVisitDate)})`
    : `dos últimos ${DEFAULT_PERIOD_DAYS} dias`;

  const share = async () => {
    setBusy(true);
    try {
      const summary = buildSummary(entries, areas, checklist.period);
      const html = visitHtml({ profile, items: checklist.items, summary, periodLabel, generatedOn: today });
      await sharePdf(html, `resumo-visita-${today}`);
    } catch (e) {
      Alert.alert('Compartilhar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Pronto para a visita"
      subtitle="Lista de apoio para se preparar para a visita de pares. Ela ajuda a organizar; não é o roteiro oficial do seu grupo nem de nenhuma certificadora.">
      <View style={styles.progress}>
        <AppText variant="display">
          {checklist.done} de {checklist.total}
        </AppText>
        <AppText variant="body" color={colors.inkMuted}>
          itens prontos
        </AppText>
        <ProgressBar value={checklist.done / checklist.total} label="Itens prontos para a visita" />
      </View>

      <View style={styles.visitBox}>
        <AppText variant="label">Última visita</AppText>
        <AppText variant="body">
          {lastVisitDate
            ? `${formatShortDate(lastVisitDate)}. A lista olha as anotações desde então.`
            : `Não informada. A lista olha os últimos ${DEFAULT_PERIOD_DAYS} dias.`}
        </AppText>
        {editingVisit ? (
          <>
            <DateStepper
              label="Data da última visita"
              value={lastVisitDate ?? addDays(today, -DEFAULT_PERIOD_DAYS)}
              max={today}
              onChange={(d) => setLastVisitDate(d)}
            />
            <Button label="Pronto" icon="check" onPress={() => finishEditing(lastVisitDate)} />
            {lastVisitDate ? (
              <Button
                label="Não lembro a data"
                variant="quiet"
                onPress={() => {
                  setLastVisitDate(undefined);
                  finishEditing(undefined);
                }}
              />
            ) : null}
          </>
        ) : (
          <Button
            label={lastVisitDate ? 'Mudar a data' : 'Informar a data'}
            variant="secondary"
            icon="calendar-edit"
            onPress={() => {
              setDateBefore(lastVisitDate);
              if (!lastVisitDate) setLastVisitDate(addDays(today, -DEFAULT_PERIOD_DAYS));
              setEditingVisit(true);
            }}
          />
        )}
      </View>

      <AppText variant="heading">O app confere sozinho</AppText>
      {autoItems.map((i) => (
        <AutoItem key={i.id} item={i} />
      ))}

      <AppText variant="heading">Você marca</AppText>
      <View style={styles.manual}>
        {manualItems.map((i) => (
          <CheckRow
            key={i.id}
            label={i.label}
            detail={i.why}
            checked={i.done}
            onChange={(v) => setManualCheck(i.id as ManualCheckId, v)}
          />
        ))}
      </View>

      <Button
        label="Compartilhar resumo para a visita"
        icon="file-pdf-box"
        size="xl"
        busy={busy}
        onPress={share}
      />
      <AppText variant="small" color={colors.inkMuted}>
        O PDF leva seus dados, esta lista e as anotações {periodLabel}.
      </AppText>

      <ConfirmDialog
        visible={askReset}
        title="Desmarcar os itens que você marcou?"
        message="A data da última visita mudou. Os itens que você marca à mão (notas, declarações, plano de manejo...) eram da visita anterior. Quer desmarcar para conferir de novo?"
        confirmLabel="Sim, desmarcar"
        cancelLabel="Não, deixar marcados"
        onConfirm={() => {
          resetManualChecks();
          setAskReset(false);
        }}
        onCancel={() => setAskReset(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progress: {
    gap: space.xs,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  visitBox: { gap: space.sm },
  item: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, borderWidth: 1.5 },
  itemDone: { borderColor: colors.leaf, backgroundColor: colors.surface },
  itemMissing: { borderColor: colors.clay, backgroundColor: colors.claySoft },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  manual: {
    padding: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
});
