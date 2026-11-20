import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CheckRow } from '@/components/CheckRow';
import { EmptyState } from '@/components/EmptyState';
import { PeriodNav } from '@/components/PeriodNav';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { capitalize } from '@/lib/catalog';
import { type DateRange, formatRange, formatShortDate, monthRange, shiftRange, today as todayISO, weekRange } from '@/lib/dates';
import { errorMessage, sharePdf } from '@/lib/device';
import { summaryHtml } from '@/lib/html';
import { buildSummary, totalText } from '@/lib/summary';
import { useApp } from '@/store';
import { colors, radius, space } from '@/theme';

type Kind = 'semana' | 'mes';

export default function Resumos() {
  const entries = useApp((s) => s.entries);
  const areas = useApp((s) => s.areas);
  const profile = useApp((s) => s.profile);
  const setCopied = useApp((s) => s.setCopied);

  const today = todayISO();
  const [kind, setKind] = useState<Kind>('semana');
  const [range, setRange] = useState<DateRange>(() => weekRange(today));
  const [busy, setBusy] = useState(false);

  const summary = useMemo(() => buildSummary(entries, areas, range), [entries, areas, range]);
  const ids = summary.groups.flatMap((g) => g.crops.flatMap((c) => c.rows.map((r) => r.entryId)));
  const canNext = range.end < today;
  const periodWord = kind === 'semana' ? 'a semana toda' : 'o mês todo';

  const changeKind = (k: Kind) => {
    setKind(k);
    setRange(k === 'semana' ? weekRange(today) : monthRange(today));
  };

  const share = async () => {
    setBusy(true);
    try {
      const label = formatRange(kind, range);
      const html = summaryHtml({
        title: kind === 'semana' ? 'Resumo da semana' : 'Resumo do mês',
        periodLabel: label,
        profile,
        summary,
      });
      await sharePdf(html, `resumo-${range.start}`);
    } catch (e) {
      Alert.alert('Compartilhar', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Resumos" subtitle="Tudo arrumado na ordem do caderno de campo, para passar a limpo rapidinho.">
      <Segmented
        label="Tipo de resumo"
        options={[
          { value: 'semana', label: 'Semana' },
          { value: 'mes', label: 'Mês' },
        ]}
        value={kind}
        onChange={changeKind}
      />
      <PeriodNav
        kind={kind}
        range={range}
        canNext={canNext}
        onPrev={() => setRange((r) => shiftRange(kind, r, -1))}
        onNext={() => setRange((r) => shiftRange(kind, r, 1))}
      />

      {summary.count === 0 ? (
        <EmptyState
          icon="clipboard-text-outline"
          title="Nada anotado neste período"
          text={
            entries.length
              ? 'Use as setas para ver outros períodos, ou faça uma anotação nova.'
              : 'Quando você anotar, o resumo aparece aqui pronto para copiar para o caderno.'
          }
          actionLabel="Anotar agora"
          actionIcon="pencil-plus"
          onAction={() => router.push('/anotar')}
        />
      ) : (
        <>
          <View style={styles.counts}>
            <AppText variant="bodyStrong">
              {summary.count} {summary.count === 1 ? 'anotação' : 'anotações'}
            </AppText>
            <AppText variant="body" color={summary.pending ? colors.clay : colors.leaf}>
              {summary.pending
                ? `${summary.pending} para passar a limpo`
                : 'Tudo passado para o caderno'}
            </AppText>
          </View>

          {summary.pending ? (
            <Button
              label={kind === 'semana' ? 'Marcar a semana toda como passada a limpo' : 'Marcar o mês todo como passado a limpo'}
              icon="checkbox-multiple-marked-outline"
              variant="secondary"
              onPress={() => setCopied(ids, true)}
            />
          ) : null}

          {summary.groups.map((g) => (
            <View key={g.areaId} style={styles.area}>
              <AppText variant="title" style={styles.areaTitle}>
                {g.areaName}
              </AppText>
              {g.crops.map((c) => (
                <View key={c.crop} style={styles.crop}>
                  <AppText variant="heading">{capitalize(c.crop)}</AppText>
                  {c.rows.map((r) => (
                    <View key={r.entryId} style={styles.row}>
                      <AppText variant="bodyStrong">
                        {formatShortDate(r.date)} · {r.activity}
                      </AppText>
                      {r.input ? <AppText variant="body">{r.input}</AppText> : null}
                      {r.quantity ? <AppText variant="body">Quantidade: {r.quantity}</AppText> : null}
                      {r.extra ? (
                        <AppText variant="small" color={colors.inkMuted}>
                          {r.extra}
                        </AppText>
                      ) : null}
                      <CheckRow
                        label="Passei para o caderno"
                        checked={r.copied}
                        onChange={(v) => setCopied([r.entryId], v)}
                      />
                    </View>
                  ))}
                  {c.totals.length ? (
                    <View style={styles.totals}>
                      <AppText variant="small" color={colors.inkMuted}>
                        Somas de {c.crop} nesta área
                      </AppText>
                      {c.totals.map((t) => (
                        <AppText key={`${t.activity}-${t.unit}`} variant="bodyStrong">
                          {totalText(t)}
                        </AppText>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ))}

          <Button label="Compartilhar / Imprimir" icon="file-pdf-box" busy={busy} onPress={share} />
          {!summary.pending ? (
            <Button
              label={`Desmarcar ${periodWord}`}
              variant="quiet"
              icon="checkbox-blank-outline"
              onPress={() => setCopied(ids, false)}
            />
          ) : null}
        </>
      )}

      <Card
        title="Colheita e venda"
        icon="scale-balance"
        onPress={() => router.push('/colheita-venda')}
        actionLabel="Ver quanto colheu e vendeu">
        <AppText variant="body" color={colors.inkMuted}>
          Quanto colheu, quanto vendeu e quanto recebeu, por cultura.
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  counts: { gap: 2 },
  area: { gap: space.md },
  areaTitle: { borderBottomWidth: 3, borderBottomColor: colors.leaf, paddingBottom: space.xs },
  crop: { gap: space.sm },
  row: {
    gap: 2,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  totals: {
    gap: 2,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.leafSoft,
  },
});
