import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { EmptyState } from '@/components/EmptyState';
import { PeriodNav } from '@/components/PeriodNav';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { capitalize, unitText } from '@/lib/catalog';
import { type DateRange, formatShortDate, monthRange, shiftRange, today as todayISO, weekRange } from '@/lib/dates';
import { formatMoney, formatNumber } from '@/lib/format';
import { barRatio, harvestByCrop } from '@/lib/harvest';
import type { Unit } from '@/lib/types';
import { useEntries } from '@/store';
import { colors, radius, space } from '@/theme';

type Kind = 'semana' | 'mes';

function qty(n: number, u: Unit): string {
  return `${formatNumber(n)} ${unitText(u, n)}`;
}

function Bar({ label, value, max, color, text }: { label: string; value: number; max: number; color: string; text: string }) {
  const ratio = barRatio(value, max);
  return (
    <View style={styles.barRow} accessible accessibilityLabel={`${label}: ${text}`}>
      <AppText variant="small" style={styles.barLabel}>
        {label}
      </AppText>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: color }]} />
      </View>
      <AppText variant="label" style={styles.barValue}>
        {text}
      </AppText>
    </View>
  );
}

export default function ColheitaVenda() {
  const entries = useEntries();
  const today = todayISO();
  const [kind, setKind] = useState<Kind>('mes');
  const [range, setRange] = useState<DateRange>(() => monthRange(today));
  const data = useMemo(() => harvestByCrop(entries, range), [entries, range]);
  const totalReceived = data.reduce((s, c) => s + c.received, 0);

  return (
    <Screen
      back
      title="Colheita e venda"
      subtitle="Só soma o que está na mesma unidade. Quilo não se mistura com caixa. O que sobrou conta tudo o que foi anotado até o fim do período.">
      <Segmented
        label="Período"
        options={[
          { value: 'semana', label: 'Semana' },
          { value: 'mes', label: 'Mês' },
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setRange(k === 'semana' ? weekRange(today) : monthRange(today));
        }}
      />
      <PeriodNav
        kind={kind}
        range={range}
        canNext={range.end < today}
        onPrev={() => setRange((r) => shiftRange(kind, r, -1))}
        onNext={() => setRange((r) => shiftRange(kind, r, 1))}
      />

      {data.length === 0 ? (
        <EmptyState
          icon="basket-outline"
          title="Sem colheita nem venda neste período"
          text="Anote as colheitas e vendas para ver aqui quanto saiu da roça e quanto entrou de dinheiro."
          actionLabel="Anotar agora"
          actionIcon="pencil-plus"
          onAction={() => router.push('/anotar')}
        />
      ) : (
        <>
          <View style={styles.total}>
            <AppText variant="body">Recebido no período</AppText>
            <AppText variant="display" color={colors.leaf}>
              {formatMoney(totalReceived)}
            </AppText>
          </View>
          {data.map((c) => (
            <View key={c.crop} style={styles.card}>
              <AppText variant="heading">{capitalize(c.crop)}</AppText>
              {c.units.map((u) => {
                const max = Math.max(u.harvested, u.sold);
                return (
                  <View key={u.unit} style={styles.unitBlock}>
                    <Bar label="Colheu" value={u.harvested} max={max} color={colors.leaf} text={qty(u.harvested, u.unit)} />
                    <Bar label="Vendeu" value={u.sold} max={max} color={colors.clay} text={qty(u.sold, u.unit)} />
                    {u.stock !== null && u.oversold ? (
                      <AppText variant="bodyStrong" color={colors.clay}>
                        Somando tudo até {formatShortDate(range.end)}, a venda passou a colheita em {qty(-u.stock, u.unit)}. Confira se falta anotar alguma colheita.
                      </AppText>
                    ) : u.stock !== null ? (
                      <AppText variant="bodyStrong">
                        Sobrou até {formatShortDate(range.end)}: {qty(u.stock, u.unit)}
                      </AppText>
                    ) : (
                      <AppText variant="small" color={colors.inkMuted}>
                        Sem colheita anotada em {unitText(u.unit, 2)} para comparar.
                      </AppText>
                    )}
                  </View>
                );
              })}
              <AppText variant="bodyStrong">Recebeu: {formatMoney(c.received)}</AppText>
              {c.salesWithoutValue ? (
                <AppText variant="small" color={colors.inkMuted}>
                  {c.salesWithoutValue === 1 ? '1 venda ficou' : `${c.salesWithoutValue} vendas ficaram`} sem valor anotado.
                </AppText>
              ) : null}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  total: {
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.leafSoft,
    gap: 2,
  },
  card: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  unitBlock: { gap: space.sm, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  barLabel: { width: 64 },
  track: { flex: 1, minWidth: 80, height: 22, borderRadius: 6, backgroundColor: colors.surfaceSunk, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  barValue: { minWidth: 96, textAlign: 'right' },
});
