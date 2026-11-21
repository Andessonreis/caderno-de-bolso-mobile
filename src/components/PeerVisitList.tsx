import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { formatLongDate } from '@/lib/dates';
import { type Visita, nomeDoProdutor, novaVisita, progresso } from '@/lib/roteiro';
import { useApp, usePeerVisits } from '@/store';
import { visitaGrandeDemais } from '@/sync/records';
import { colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { ProgressBar } from './StepProgress';

/** Abre o roteiro de uma visita. */
export function openPeerVisit(id: string) {
  router.push({ pathname: '/visita-par/[id]', params: { id } });
}

interface PeerVisitListProps {
  /** Pede a confirmação para apagar (quem chama mostra o diálogo e o "Desfazer"). */
  onAskDelete: (visit: Visita) => void;
}

/** Lista das visitas feitas à roça de outros produtores, com o botão para começar uma nova. */
export function PeerVisitList({ onAskDelete }: PeerVisitListProps) {
  const visits = usePeerVisits();
  const savePeerVisit = useApp((s) => s.savePeerVisit);
  const syncLigado = useApp((s) => s.sync.ligado);

  const start = () => {
    const v = novaVisita();
    savePeerVisit(v);
    openPeerVisit(v.id);
  };

  return (
    <>
      <View style={styles.note}>
        <AppText variant="body">
          Use quando você for <AppText variant="bodyStrong">visitar a roça de outro produtor</AppText> do grupo. As
          perguntas se respondem com um toque e tudo fica salvo neste celular na hora, sem precisar de internet.
        </AppText>
        <AppText variant="small" color={colors.inkMuted}>
          É um roteiro de apoio para organizar a visita. Não substitui o roteiro nem os documentos oficiais do seu
          grupo (OPAC).
        </AppText>
      </View>

      <Button label="Começar uma visita" icon="plus" size="xl" onPress={start} />

      <AppText variant="heading">Visitas guardadas neste celular</AppText>
      {visits.length === 0 ? (
        <EmptyState
          icon="clipboard-text-outline"
          title="Nenhuma visita ainda"
          text="Toque em Começar uma visita quando chegar na roça do produtor. Dá para parar e continuar depois."
        />
      ) : (
        visits.map((v) => {
          const p = progresso(v);
          const nome = nomeDoProdutor(v);
          return (
            <View key={v.id} style={styles.card}>
              <AppText variant="heading">{nome}</AppText>
              <AppText variant="small" color={colors.inkMuted}>
                {v.data ? formatLongDate(v.data) : 'Sem data'}
                {v.produtor.municipio ? ` · ${v.produtor.municipio}` : ''}
              </AppText>
              <ProgressBar value={p.fracao} label={`Visita a ${nome}: ${p.feitos} de ${p.total} respondidas`} />
              <AppText variant="label">
                {p.feitos} de {p.total} respondidas
              </AppText>
              {syncLigado && visitaGrandeDemais(v) ? (
                <AppText variant="small" color={colors.clay}>
                  Esta visita ficou grande demais para a cópia na internet. Ela continua guardada neste celular.
                </AppText>
              ) : null}
              <View style={styles.actions}>
                <Button
                  label="Continuar"
                  icon="pencil-outline"
                  variant="secondary"
                  hint={`Continuar a visita a ${nome}`}
                  style={styles.flex}
                  onPress={() => openPeerVisit(v.id)}
                />
                <Button
                  label="Apagar"
                  icon="trash-can-outline"
                  variant="danger"
                  hint={`Apagar a visita a ${nome}`}
                  style={styles.flex}
                  onPress={() => onAskDelete(v)}
                />
              </View>
            </View>
          );
        })
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  note: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.warnSoft },
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  actions: { flexDirection: 'row', gap: space.sm },
});
