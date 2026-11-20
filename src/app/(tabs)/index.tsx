import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ProgressBar } from '@/components/StepProgress';
import { SyncIndicator } from '@/components/SyncIndicator';
import { computeChecklist } from '@/lib/checklist';
import { formatLongDate, inRange, today as todayISO, weekRange } from '@/lib/dates';
import { describeEntry } from '@/lib/sentence';
import { areaNameOf } from '@/lib/summary';
import { useApp, useAreas, useEntries, usePhotos } from '@/store';
import { colors, space } from '@/theme';

function greeting(hour: number): string {
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function Inicio() {
  const profile = useApp((s) => s.profile);
  const entries = useEntries();
  const areas = useAreas();
  const photos = usePhotos();
  const manualChecks = useApp((s) => s.manualChecks);
  const lastVisitDate = useApp((s) => s.lastVisitDate);
  const lastExportAt = useApp((s) => s.lastExportAt);

  const today = todayISO();
  const week = weekRange(today);
  const weekEntries = entries.filter((e) => inRange(e.date, week));
  const pendingWeek = weekEntries.filter((e) => !e.copied).length;
  const pendingOlder = entries.filter((e) => !e.copied && e.date < week.start).length;
  const checklist = computeChecklist({ entries, photos, manual: manualChecks, lastVisitDate, lastExportAt, today });
  const recent = [...entries]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);
  const firstName = profile?.name.split(' ')[0] ?? '';

  return (
    <Screen>
      <View style={styles.hello}>
        <AppText variant="title">
          {greeting(new Date().getHours())}
          {firstName ? `, ${firstName}` : ''}!
        </AppText>
        <AppText variant="body" color={colors.inkMuted}>
          {formatLongDate(today)}
        </AppText>
      </View>

      <SyncIndicator />

      {profile?.exemplo ? (
        <Card tone="warn" icon="information-outline" title="Dados de exemplo">
          <AppText variant="body">
            Você está vendo um produtor fictício para conhecer o app. Para começar com os seus dados, vá em Mais e toque em
            &quot;Apagar dados de exemplo&quot;.
          </AppText>
        </Card>
      ) : null}

      <Button
        label="Anotar agora"
        icon="pencil-plus"
        size="xl"
        hint="Abre o passo a passo para anotar uma atividade"
        onPress={() => router.push('/anotar')}
      />

      <Card
        title="Esta semana"
        icon="calendar-week"
        onPress={() => router.push('/resumos')}
        actionLabel="Ver resumo da semana"
        accessibilityLabel={`Esta semana: ${weekEntries.length} anotações, ${pendingWeek} para passar a limpo.${pendingOlder ? ` Mais ${pendingOlder} de semanas anteriores.` : ''} Ver resumo da semana`}>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <AppText variant="display">{weekEntries.length}</AppText>
            <AppText variant="small" color={colors.inkMuted}>
              {weekEntries.length === 1 ? 'anotação' : 'anotações'}
            </AppText>
          </View>
          <View style={styles.stat}>
            <AppText variant="display" color={pendingWeek ? colors.clay : colors.leaf}>
              {pendingWeek}
            </AppText>
            <AppText variant="small" color={colors.inkMuted}>
              para passar a limpo
            </AppText>
          </View>
        </View>
        {pendingOlder ? (
          <AppText variant="body" color={colors.clay}>
            Mais {pendingOlder} {pendingOlder === 1 ? 'anotação' : 'anotações'} de semanas anteriores para passar a limpo.
          </AppText>
        ) : null}
      </Card>

      <Card
        title="Pronto para a visita"
        icon="account-group-outline"
        onPress={() => router.push('/visita')}
        actionLabel="Ver o que falta"
        accessibilityLabel={`Pronto para a visita: ${checklist.done} de ${checklist.total} itens. Ver o que falta`}>
        <AppText variant="body">
          {checklist.done} de {checklist.total} itens prontos
        </AppText>
        <ProgressBar value={checklist.done / checklist.total} label="Progresso para a visita" />
      </Card>

      <Card
        title="Minha ficha (QR)"
        icon="qrcode"
        onPress={() => router.push('/ficha')}
        actionLabel="Mostrar ao comprador">
        <AppText variant="body" color={colors.inkMuted}>
          Um código para o comprador ver quem produziu, sem precisar de foto nem de visita.
        </AppText>
      </Card>

      {recent.length ? (
        <Card title="Últimas anotações" icon="history" onPress={() => router.push('/caderno')} actionLabel="Abrir o caderno">
          {recent.map((e) => (
            <AppText key={e.id} variant="body" style={styles.recent}>
              {describeEntry(e, areaNameOf(areas, e.areaId), today)}
            </AppText>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hello: { gap: space.xs, marginTop: space.sm },
  stats: { flexDirection: 'row', gap: space.lg },
  stat: { flex: 1 },
  recent: { paddingVertical: space.xs, borderTopWidth: 1, borderTopColor: colors.line },
});
