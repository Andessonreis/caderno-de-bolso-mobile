import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { hapticSuccess } from '@/lib/device';
import { codigoDoTexto, faltamParaGrupo, formatarCodigo, type SituacaoNoGrupo, situacaoNoGrupo } from '@/lib/grupo';
import type { Visita } from '@/lib/roteiro';
import { SYNC_AVAILABLE } from '@/sync/device';
import { groupLabel } from '@/sync/label';
import { checkGroup, enterGroup, leaveGroup, useGroupStatus, useSyncStatus } from '@/sync/service';
import { useApp } from '@/store';
import { colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { Field } from './Field';
import { Icon, type IconName } from './Icon';

const MENSAGEM = {
  formato: 'O código tem 10 letras e números, como ABCDE-23456. Confira e tente de novo.',
  nao_encontrado: 'Esse código não é de nenhum grupo. Confira o código com quem coordena o grupo.',
  sem_internet:
    'Sem internet agora. Para entrar no grupo é preciso internet; tente de novo quando tiver sinal. As visitas continuam guardadas neste celular.',
  erro: 'Não deu para conferir o código agora. Tente de novo daqui a pouco.',
} as const;

const TONS = { ok: colors.leaf, aviso: colors.warn, neutro: colors.inkMuted } as const;

/** Campo do código, botão "Entrar no grupo" e a confirmação com o nome do grupo. */
export function GroupJoinForm({
  inicial = '',
  onCamera,
  onJoined,
}: {
  inicial?: string;
  onCamera: () => void;
  onJoined?: (nome: string) => void;
}) {
  const [texto, setTexto] = useState(() => formatarCodigo(inicial));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [achado, setAchado] = useState<{ codigo: string; nome: string } | null>(null);

  const mudar = (t: string) => {
    // Link colado inteiro (cadernodebolso://grupo?c=...): fica só o código.
    const doLink = t.includes('?') ? codigoDoTexto(t) : null;
    setTexto(formatarCodigo(doLink ?? t));
    setErro(null);
  };

  const conferir = async () => {
    const codigo = codigoDoTexto(texto);
    if (!codigo) {
      setErro(MENSAGEM.formato);
      return;
    }
    setErro(null);
    setBusy(true);
    const r = await checkGroup(codigo);
    setBusy(false);
    if (r.ok) setAchado({ codigo, nome: r.nome });
    else setErro(MENSAGEM[r.motivo]);
  };

  const confirmar = () => {
    if (!achado) return;
    enterGroup(achado.codigo, achado.nome);
    hapticSuccess();
    setAchado(null);
    onJoined?.(achado.nome);
  };

  return (
    <View style={styles.form}>
      <Field
        label="Código do grupo"
        help="Peça o código a quem coordena o grupo."
        placeholder="ABCDE-23456"
        value={texto}
        onChangeText={mudar}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        onSubmitEditing={conferir}
      />
      <Button label="Entrar no grupo" icon="account-group-outline" busy={busy} disabled={!texto} onPress={conferir} />
      <Button label="Ler o código com a câmera" icon="qrcode-scan" variant="secondary" onPress={onCamera} />
      {erro ? (
        <AppText variant="bodyStrong" color={colors.danger} accessibilityRole="alert">
          {erro}
        </AppText>
      ) : null}
      <ConfirmDialog
        visible={achado !== null}
        title={achado ? `Grupo: ${achado.nome}` : ''}
        message={
          achado
            ? `As visitas que você fizer serão enviadas para a coordenação de ${achado.nome}. Quem coordena o grupo vai ver o que foi preenchido, inclusive o nome do produtor visitado.`
            : ''
        }
        confirmLabel="Sim"
        cancelLabel="Não"
        onConfirm={confirmar}
        onCancel={() => setAchado(null)}
      />
    </View>
  );
}

/** Cartão "Grupo" no alto da lista de visitas: entrar, ver se tudo foi enviado e sair. */
export function GroupCard() {
  const grupo = useApp((s) => s.grupo);
  const exemplo = useApp((s) => Boolean(s.profile?.exemplo));
  const faltam = useApp((s) => faltamParaGrupo(s.peerVisits, s.grupoEnviadas));
  const fase = useGroupStatus((s) => s.fase);
  const online = useSyncStatus((s) => s.online);
  const [askLeave, setAskLeave] = useState(false);
  const abrirCamera = () => router.push('/grupo');

  if (!SYNC_AVAILABLE) {
    return (
      <View style={styles.card}>
        <AppText variant="heading">Enviar as visitas para o grupo</AppText>
        <AppText variant="body">Enviar as visitas para o grupo funciona no app do celular.</AppText>
      </View>
    );
  }

  if (!grupo) {
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Icon name="account-group-outline" size={30} color={colors.leaf} />
          <AppText variant="heading" style={styles.flex}>
            Enviar as visitas para o grupo
          </AppText>
        </View>
        <AppText variant="body">
          Se o seu grupo (núcleo, associação ou cooperativa) junta as visitas num lugar só, digite o código do grupo.
        </AppText>
        <GroupJoinForm onCamera={abrirCamera} />
      </View>
    );
  }

  const label = groupLabel({ fase, online, faltam, exemplo });
  const tom = TONS[label.tone];

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Icon name="account-group-outline" size={30} color={colors.leaf} />
        <AppText variant="heading" style={styles.flex}>
          Grupo: {grupo.nome}
        </AppText>
      </View>
      <View style={styles.row} accessible accessibilityLiveRegion="polite" accessibilityLabel={label.text}>
        <Icon name={label.icon} size={24} color={tom} />
        <AppText variant="label" color={tom} style={styles.flex}>
          {label.text}
        </AppText>
      </View>
      {fase === 'nao_encontrado' ? (
        <>
          <AppText variant="body">
            O código de {grupo.nome} não vale mais: o grupo pode ter sido apagado ou o código mudou. Peça o código de novo
            a quem coordena e digite aqui. Nada foi apagado deste celular.
          </AppText>
          <GroupJoinForm onCamera={abrirCamera} />
        </>
      ) : (
        <AppText variant="small" color={colors.inkMuted}>
          As visitas com o nome do produtor vão para a coordenação do grupo sempre que houver internet.
        </AppText>
      )}
      <Button label="Sair do grupo" icon="logout" variant="quiet" onPress={() => setAskLeave(true)} />
      <ConfirmDialog
        visible={askLeave}
        title="Sair do grupo?"
        message={`As visitas deixam de ir para ${grupo.nome}. O que já foi enviado continua com a coordenação do grupo; para tirar de lá, fale com quem coordena. As visitas continuam guardadas neste celular.`}
        confirmLabel="Sim, sair do grupo"
        cancelLabel="Não, continuar no grupo"
        onConfirm={() => {
          leaveGroup();
          setAskLeave(false);
        }}
        onCancel={() => setAskLeave(false)}
      />
    </View>
  );
}

const SITUACAO: Record<Exclude<SituacaoNoGrupo, 'fora'>, { text: string; icon: IconName; color: string }> = {
  enviada: { text: 'Enviada ao grupo', icon: 'cloud-check-outline', color: colors.leaf },
  falta: { text: 'Falta enviar ao grupo', icon: 'cloud-upload-outline', color: colors.warn },
  sem_nome: {
    text: 'Vai para o grupo quando tiver o nome do produtor',
    icon: 'cloud-upload-outline',
    color: colors.inkMuted,
  },
  grande_demais: {
    text: 'Esta visita ficou grande demais para enviar ao grupo. Ela continua guardada neste celular.',
    icon: 'cloud-off-outline',
    color: colors.clay,
  },
};

/** Linha "Enviada ao grupo" / "Falta enviar ao grupo" de uma visita (só quando há grupo). */
export function VisitGroupStatus({ visita }: { visita: Visita }) {
  const temGrupo = useApp((s) => s.grupo !== null && !s.profile?.exemplo);
  const aceita = useApp((s) => s.grupoEnviadas[visita.id]);
  if (!temGrupo || !SYNC_AVAILABLE) return null;
  const s = situacaoNoGrupo(visita, aceita ? { [visita.id]: aceita } : {});
  if (s === 'fora') return null;
  const info = SITUACAO[s];
  return (
    <View style={styles.row} accessible accessibilityLabel={info.text}>
      <Icon name={info.icon} size={24} color={info.color} />
      <AppText variant="label" color={info.color} style={styles.flex}>
        {info.text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  form: { gap: space.sm },
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.leaf,
    backgroundColor: colors.surface,
  },
});
