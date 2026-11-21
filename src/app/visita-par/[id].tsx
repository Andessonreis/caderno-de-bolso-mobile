import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ChoiceTile } from '@/components/ChoiceTile';
import { DateStepper } from '@/components/DateStepper';
import { Field, type FieldInput } from '@/components/Field';
import { VisitGroupStatus } from '@/components/GroupCard';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ProgressBar } from '@/components/StepProgress';
import { VisitQuestion } from '@/components/VisitQuestion';
import { type Rascunhos, RascunhosContext, VisitTextField } from '@/components/VisitTextField';
import { capitalize } from '@/lib/catalog';
import { addDays, today as todayISO } from '@/lib/dates';
import { errorMessage, hapticSuccess, sharePdf } from '@/lib/device';
import { type Ficha, decodeFicha, fichaPayloadFrom } from '@/lib/ficha';
import { roteiroHtml } from '@/lib/html';
import {
  CULTURAS_SENSIVEIS,
  ETAPAS,
  type EtapaId,
  LIMITES_VISITA,
  OPCOES_PARECER,
  OPCOES_TIPO,
  type Pendencia,
  type Visita,
  culturasSensiveisDe,
  itensDaEtapa,
  limparTexto,
  nomeDoArquivo,
  novoId,
  pendencias,
  totalDePerguntas,
  visitaVazia,
} from '@/lib/roteiro';
import { useApp } from '@/store';
import { visitaGrandeDemais } from '@/sync/records';
import { TOUCH_MIN, colors, radius, space } from '@/theme';

/** Índice ETAPAS.length é a tela de resumo. */
const RESUMO = ETAPAS.length;

type Atualizar = (mudar: (v: Visita) => Visita) => void;

type FichaMsg = { erro: boolean; texto: string; configuracoes?: boolean };

/** Salva agora os textos que esperavam a pausa na digitação. */
function salvarRascunhos(lista: Map<string, () => void>) {
  for (const salvar of [...lista.values()]) salvar();
}

/**
 * Roteiro de apoio à visita, preenchido na roça de outro produtor. Sete etapas
 * e o resumo; cada toque é salvo no celular na mesma hora e o texto digitado,
 * logo depois de uma pausa (e sempre antes de sair da tela).
 */
export default function VisitaPar() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const visita = useApp((s) => s.peerVisits.find((v) => v.id === id && !v.deletedAt));
  const savePeerVisit = useApp((s) => s.savePeerVisit);
  const syncLigado = useApp((s) => s.sync.ligado);
  const [indice, setIndice] = useState(0);
  const [salvo, setSalvo] = useState(false);
  const [camera, setCamera] = useState(false);
  const [qrMsg, setQrMsg] = useState<string | null>(null);
  const [fichaMsg, setFichaMsg] = useState<FichaMsg | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const scanned = useRef(false);
  const avisouQr = useRef(false);
  const rascunhos = useRef(new Map<string, () => void>());
  const [contexto] = useState<Rascunhos>(() => ({
    guardar: (chave, salvarAgora) => rascunhos.current.set(chave, salvarAgora),
    soltar: (chave) => rascunhos.current.delete(chave),
  }));

  // Ao sair da tela (botão, voltar do celular ou gesto): salva o texto que
  // esperava e, se a visita ficou sem nada, apaga.
  useEffect(() => {
    const lista = rascunhos;
    const app = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') salvarRascunhos(lista.current);
    });
    return () => {
      app.remove();
      salvarRascunhos(lista.current);
      const { peerVisits, deletePeerVisit } = useApp.getState();
      const atual = peerVisits.find((v) => v.id === id && !v.deletedAt);
      if (atual && visitaVazia(atual)) deletePeerVisit(atual.id);
    };
  }, [id]);

  // Com a câmera aberta, o voltar do celular fecha a câmera em vez de sair da visita.
  useEffect(() => {
    if (!camera) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setCamera(false);
      return true;
    });
    return () => sub.remove();
  }, [camera]);

  const voltarParaLista = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/visita', params: { modo: 'outra' } });

  if (!visita) {
    return (
      <Screen back onBack={voltarParaLista} backLabel="Lista de visitas" title="Visita não encontrada">
        <AppText variant="body">Esta visita foi apagada ou não está neste celular.</AppText>
      </Screen>
    );
  }

  /** Toda mudança passa por aqui e é salva no celular na mesma hora (sempre sobre a versão mais recente). */
  const atualizar: Atualizar = (mudar) => {
    const atual = useApp.getState().peerVisits.find((v) => v.id === visita.id) ?? visita;
    savePeerVisit(mudar(atual));
    setSalvo(true);
  };

  const usarFicha = (ficha: Ficha) => {
    // A ficha passa pela mesma limpeza e pelos mesmos limites do que é digitado.
    const culturas = (ficha.cu ?? [])
      .map((c) => limparTexto(c, LIMITES_VISITA.cultura))
      .filter(Boolean)
      .slice(0, LIMITES_VISITA.culturas);
    const sensiveis = culturasSensiveisDe(culturas);
    const municipio = limparTexto(ficha.m, LIMITES_VISITA.municipio);
    atualizar((v) => ({
      ...v,
      produtor: {
        nome: limparTexto(ficha.n, LIMITES_VISITA.nome),
        municipio: municipio || v.produtor.municipio,
        culturas,
      },
      culturasSensiveis: sensiveis.length ? sensiveis : v.culturasSensiveis,
    }));
    setFichaMsg({ erro: false, texto: `Dados de ${ficha.n} preenchidos.` });
  };

  const abrirCamera = async () => {
    setFichaMsg(null);
    const p = permission?.granted ? permission : await requestPermission();
    if (!p.granted) {
      setFichaMsg({
        erro: true,
        texto:
          'Para ler o QR, o app precisa da permissão da câmera. Libere nas configurações do celular ou cole o link.',
        // Negada de vez: o celular não pergunta mais, só dá para liberar nas configurações.
        configuracoes: !p.canAskAgain,
      });
      return;
    }
    scanned.current = false;
    avisouQr.current = false;
    setQrMsg(null);
    setCamera(true);
  };

  const gerarPdf = async () => {
    setBusy(true);
    try {
      await sharePdf(roteiroHtml(visita, todayISO()), nomeDoArquivo(visita));
    } catch (e) {
      Alert.alert('Gerar PDF', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (camera) {
    return (
      <SafeAreaView style={styles.cameraWrap}>
        <AppText variant="heading" color={colors.white} center style={styles.cameraText}>
          Aponte para o QR da ficha do produtor
        </AppText>
        {qrMsg ? (
          <AppText
            variant="bodyStrong"
            color={colors.white}
            center
            style={styles.cameraText}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite">
            {qrMsg}
          </AppText>
        ) : null}
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (scanned.current) return;
            const payload = fichaPayloadFrom(data);
            const ficha = payload ? decodeFicha(payload) : null;
            if (!ficha) {
              // O leitor chama várias vezes por segundo: avisa uma vez só.
              if (!avisouQr.current) {
                avisouQr.current = true;
                setQrMsg('Este código não é de uma ficha do Caderno de Bolso.');
              }
              return;
            }
            scanned.current = true;
            hapticSuccess();
            usarFicha(ficha);
            setCamera(false);
          }}
        />
        <View style={styles.cameraFooter}>
          <Button label="Cancelar" variant="secondary" onPress={() => setCamera(false)} />
        </View>
      </SafeAreaView>
    );
  }

  // Uma conta só por tela: o progresso, as etapas e o resumo usam a mesma lista.
  const faltando = pendencias(visita);
  const total = totalDePerguntas(visita);
  const p = { feitos: total - faltando.length, total, fracao: total ? (total - faltando.length) / total : 0 };
  const etapa = indice < RESUMO ? ETAPAS[indice] : null;
  const irPara = (alvo: EtapaId) => setIndice(ETAPAS.findIndex((e) => e.id === alvo));

  const top = (
    <View style={styles.top}>
      <AppText variant="label" color={colors.clay}>
        {visita.produtor.nome.trim() ? `Visita a ${visita.produtor.nome.trim()}` : 'Nova visita'}
      </AppText>
      <View style={styles.progressRow}>
        <AppText variant="bodyStrong">
          {p.feitos} de {p.total} respondidas
        </AppText>
        {salvo ? (
          <View style={styles.saved} accessibilityLiveRegion="polite">
            <Icon name="check" size={18} color={colors.leaf} />
            <AppText variant="small" color={colors.leaf}>
              Salvo neste celular
            </AppText>
          </View>
        ) : null}
      </View>
      <ProgressBar value={p.fracao} label={`${p.feitos} de ${p.total} respondidas`} />
      <View style={styles.chips}>
        {ETAPAS.map((e, i) => {
          const atual = i === indice;
          const completa = faltando.every((x) => x.etapa !== e.id);
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={`Etapa ${i + 1}: ${e.titulo}${completa ? ', respondida' : ''}`}
              accessibilityState={{ selected: atual }}
              onPress={() => setIndice(i)}
              style={({ pressed }) => [styles.chip, atual && styles.chipOn, pressed && !atual && styles.chipPressed]}>
              <AppText variant="label" color={atual ? colors.onLeaf : colors.ink}>
                {i + 1}
              </AppText>
              {completa ? <Icon name="check" size={16} color={atual ? colors.onLeaf : colors.leaf} /> : null}
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Resumo da visita"
          accessibilityState={{ selected: indice === RESUMO }}
          onPress={() => setIndice(RESUMO)}
          style={({ pressed }) => [
            styles.chip,
            styles.chipWide,
            indice === RESUMO && styles.chipOn,
            pressed && indice !== RESUMO && styles.chipPressed,
          ]}>
          <AppText variant="label" color={indice === RESUMO ? colors.onLeaf : colors.ink}>
            Resumo
          </AppText>
        </Pressable>
      </View>
      <AppText variant="small" color={colors.inkMuted}>
        {etapa ? `Etapa ${indice + 1} de ${ETAPAS.length}` : 'Fim da visita'}
      </AppText>
    </View>
  );

  const footer = (
    <View style={styles.footerRow}>
      {indice > 0 ? (
        <Button
          label="Voltar"
          icon="arrow-left"
          variant="secondary"
          style={styles.flex}
          onPress={() => setIndice(indice - 1)}
        />
      ) : null}
      {indice < RESUMO ? (
        <Button
          label={indice + 1 < RESUMO ? 'Próxima etapa' : 'Ver resumo'}
          icon="arrow-right"
          style={styles.flex}
          onPress={() => setIndice(indice + 1)}
        />
      ) : (
        <Button label="Lista de visitas" icon="format-list-bulleted" style={styles.flex} onPress={voltarParaLista} />
      )}
    </View>
  );

  return (
    <RascunhosContext value={contexto}>
      {/* A chave refaz a rolagem a cada etapa: a etapa nova começa do alto. */}
      <Screen
        key={indice}
        back
        onBack={voltarParaLista}
        backLabel="Lista de visitas"
        top={top}
        title={etapa ? etapa.titulo : 'Resumo'}
        subtitle={etapa ? etapa.resumo : 'O que falta responder e a folha para assinar.'}
        footer={footer}>
        {etapa?.id === 'identificacao' ? (
          <Identificacao
            visita={visita}
            atualizar={atualizar}
            onCamera={abrirCamera}
            onFicha={(texto) => {
              const payload = fichaPayloadFrom(texto);
              const ficha = payload ? decodeFicha(payload) : null;
              if (ficha) usarFicha(ficha);
              else
                setFichaMsg({
                  erro: true,
                  texto: texto.trim()
                    ? 'Não conseguimos ler esta ficha. Confira se o link está completo.'
                    : 'Cole o link da ficha que aparece ao ler o QR do produtor.',
                });
            }}
            fichaMsg={fichaMsg}
          />
        ) : null}

        {etapa?.id === 'sementes' ? (
          <View style={styles.group}>
            <AppText variant="bodyStrong">Tem algodão, feijão, milho ou soja plantado?</AppText>
            <AppText variant="small" color={colors.inkMuted}>
              Marque as que tiver. Para essas culturas o roteiro pede a comprovação de origem.
            </AppText>
            {CULTURAS_SENSIVEIS.map((cultura) => (
              <ChoiceTile
                key={cultura}
                role="checkbox"
                label={capitalize(cultura)}
                selected={visita.culturasSensiveis.includes(cultura)}
                onPress={() =>
                  atualizar((v) => ({
                    ...v,
                    culturasSensiveis: v.culturasSensiveis.includes(cultura)
                      ? v.culturasSensiveis.filter((c) => c !== cultura)
                      : CULTURAS_SENSIVEIS.filter((c) => c === cultura || v.culturasSensiveis.includes(c)),
                  }))
                }
              />
            ))}
          </View>
        ) : null}

        {etapa?.id === 'colheita' ? (
          <View style={styles.group}>
            <AppText variant="bodyStrong">O armazém e o transporte são:</AppText>
            <ChoiceTile
              label="Só para orgânico"
              selected={visita.usoArmazenamento === 'exclusivo'}
              onPress={() => atualizar((v) => ({ ...v, usoArmazenamento: 'exclusivo' }))}
            />
            <ChoiceTile
              label="Compartilhados com convencional"
              selected={visita.usoArmazenamento === 'compartilhado'}
              onPress={() => atualizar((v) => ({ ...v, usoArmazenamento: 'compartilhado' }))}
            />
            {visita.usoArmazenamento === 'compartilhado' ? (
              <VisitTextField
                label="Como a separação é feita e registrada?"
                help="Por exemplo: sacaria marcada, lugar separado no depósito, anotação no caderno."
                value={visita.separacao}
                onSave={(t) => atualizar((v) => ({ ...v, separacao: t }))}
                limite={LIMITES_VISITA.textoLongo}
                multiline
              />
            ) : null}
          </View>
        ) : null}

        {etapa
          ? itensDaEtapa(visita, etapa.id).map((item) => (
              <VisitQuestion
                key={item.id}
                item={item}
                resposta={visita.respostas[item.id]}
                onChange={(mudar) =>
                  atualizar((v) => ({ ...v, respostas: { ...v.respostas, [item.id]: mudar(v.respostas[item.id]) } }))
                }
              />
            ))
          : null}

        {etapa?.id === 'fechamento' ? <Fechamento visita={visita} atualizar={atualizar} /> : null}

        {indice === RESUMO ? (
          <Resumo
            lista={faltando}
            grandeDemais={syncLigado && visitaGrandeDemais(visita)}
            irPara={irPara}
            onPdf={gerarPdf}
            busy={busy}
          />
        ) : null}
        {indice === RESUMO ? <VisitGroupStatus visita={visita} /> : null}
      </Screen>
    </RascunhosContext>
  );
}

function Identificacao({
  visita,
  atualizar,
  onCamera,
  onFicha,
  fichaMsg,
}: {
  visita: Visita;
  atualizar: Atualizar;
  onCamera: () => void;
  onFicha: (texto: string) => void;
  fichaMsg: FichaMsg | null;
}) {
  const [link, setLink] = useState('');
  const nomeRef = useRef<FieldInput>(null);
  const municipioRef = useRef<FieldInput>(null);
  const visitantesRef = useRef<FieldInput>(null);
  const today = todayISO();

  return (
    <>
      <View style={styles.ficha}>
        <AppText variant="heading">Tem a ficha do produtor?</AppText>
        <AppText variant="small" color={colors.inkMuted}>
          Leia o QR da ficha dele para não precisar digitar. É opcional.
        </AppText>
        <Button label="Ler o QR da ficha com a câmera" icon="qrcode-scan" onPress={onCamera} />
        <Field
          label="Ou cole o link da ficha"
          placeholder="https://…/ficha/#d=…"
          value={link}
          onChangeText={setLink}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={() => onFicha(link)}
        />
        <Button label="Usar dados da ficha" variant="secondary" icon="check" onPress={() => onFicha(link)} />
        {fichaMsg ? (
          <AppText
            variant="bodyStrong"
            color={fichaMsg.erro ? colors.danger : colors.leaf}
            accessibilityRole={fichaMsg.erro ? 'alert' : undefined}
            accessibilityLiveRegion="polite">
            {fichaMsg.texto}
          </AppText>
        ) : null}
        {fichaMsg?.configuracoes ? (
          <Button
            label="Abrir configurações"
            variant="secondary"
            icon="cog-outline"
            onPress={() => Linking.openSettings()}
          />
        ) : null}
      </View>

      <VisitTextField
        label="Nome do produtor visitado"
        inputRef={nomeRef}
        next={municipioRef}
        value={visita.produtor.nome}
        onSave={(t) => atualizar((v) => ({ ...v, produtor: { ...v.produtor, nome: t } }))}
        limite={LIMITES_VISITA.nome}
        autoCapitalize="words"
      />
      <VisitTextField
        label="Município"
        optional
        inputRef={municipioRef}
        next={visitantesRef}
        value={visita.produtor.municipio}
        onSave={(t) => atualizar((v) => ({ ...v, produtor: { ...v.produtor, municipio: t } }))}
        limite={LIMITES_VISITA.municipio}
        autoCapitalize="words"
      />
      {visita.produtor.culturas.length ? (
        <AppText variant="small" color={colors.inkMuted}>
          Culturas na ficha: {visita.produtor.culturas.join(', ')}.
        </AppText>
      ) : null}
      <VisitTextField
        label="Quem está visitando"
        help="Os nomes, separados por vírgula."
        optional
        inputRef={visitantesRef}
        value={visita.visitantes}
        onSave={(t) => atualizar((v) => ({ ...v, visitantes: t }))}
        limite={LIMITES_VISITA.visitantes}
        autoCapitalize="words"
      />

      <View style={styles.group}>
        <AppText variant="label">Data da visita</AppText>
        {visita.data ? (
          <DateStepper
            label="Data da visita"
            value={visita.data}
            max={addDays(today, 60)}
            onChange={(d) => atualizar((v) => ({ ...v, data: d }))}
          />
        ) : (
          <Button
            label="Informar a data"
            variant="secondary"
            icon="calendar-edit"
            onPress={() => atualizar((v) => ({ ...v, data: today }))}
          />
        )}
      </View>

      <View style={styles.group}>
        <AppText variant="bodyStrong">Tipo de visita</AppText>
        {OPCOES_TIPO.map((o) => (
          <ChoiceTile
            key={o.valor}
            label={o.rotulo}
            sublabel={o.ajuda}
            selected={visita.tipo === o.valor}
            onPress={() => atualizar((v) => ({ ...v, tipo: o.valor }))}
          />
        ))}
      </View>
    </>
  );
}

function Fechamento({ visita, atualizar }: { visita: Visita; atualizar: Atualizar }) {
  const today = todayISO();
  const mudarNc = (ncId: string, campo: 'descricao' | 'prazo', valor: string) =>
    atualizar((v) => ({
      ...v,
      naoConformidades: v.naoConformidades.map((n) => (n.id === ncId ? { ...n, [campo]: valor } : n)),
    }));
  const podeAnotar = visita.naoConformidades.length < LIMITES_VISITA.naoConformidades;

  return (
    <>
      <View style={styles.group}>
        <AppText variant="heading">O que precisa corrigir</AppText>
        <AppText variant="small" color={colors.inkMuted}>
          Cada não conformidade com o prazo combinado para corrigir.
        </AppText>
        {visita.naoConformidades.length === 0 ? <AppText variant="body">Nenhuma anotada.</AppText> : null}
        {visita.naoConformidades.map((nc, i) => (
          <View key={nc.id} style={styles.nc}>
            <VisitTextField
              label={`O que precisa corrigir (${i + 1})`}
              value={nc.descricao}
              onSave={(t) => mudarNc(nc.id, 'descricao', t)}
              limite={LIMITES_VISITA.naoConformidade}
              multiline
            />
            <AppText variant="label">Prazo para corrigir</AppText>
            {nc.prazo ? (
              <>
                <DateStepper
                  label={`Prazo para corrigir o item ${i + 1}`}
                  value={nc.prazo}
                  max={addDays(today, 730)}
                  onChange={(d) => mudarNc(nc.id, 'prazo', d)}
                />
                <Button label="Tirar o prazo" variant="quiet" onPress={() => mudarNc(nc.id, 'prazo', '')} />
              </>
            ) : (
              <Button
                label="Marcar prazo"
                variant="secondary"
                icon="calendar-edit"
                hint={`Item ${i + 1}`}
                onPress={() => mudarNc(nc.id, 'prazo', addDays(today, 30))}
              />
            )}
            <Button
              label="Tirar este item"
              variant="danger"
              icon="trash-can-outline"
              hint={`Item ${i + 1}`}
              onPress={() =>
                atualizar((v) => ({ ...v, naoConformidades: v.naoConformidades.filter((n) => n.id !== nc.id) }))
              }
            />
          </View>
        ))}
        {podeAnotar ? (
          <Button
            label="Anotar não conformidade"
            variant="secondary"
            icon="plus"
            onPress={() =>
              atualizar((v) => ({
                ...v,
                naoConformidades: [...v.naoConformidades, { id: novoId(), descricao: '', prazo: '' }],
              }))
            }
          />
        ) : null}
      </View>

      <VisitTextField
        label="Pontos fortes"
        help="O que a família está fazendo bem e pode servir de exemplo."
        optional
        value={visita.pontosFortes}
        onSave={(t) => atualizar((v) => ({ ...v, pontosFortes: t }))}
        limite={LIMITES_VISITA.textoLongo}
        multiline
      />
      <VisitTextField
        label="Observações"
        optional
        value={visita.observacoes}
        onSave={(t) => atualizar((v) => ({ ...v, observacoes: t }))}
        limite={LIMITES_VISITA.textoLongo}
        multiline
      />

      <View style={styles.group}>
        <AppText variant="bodyStrong">Parecer da visita</AppText>
        {OPCOES_PARECER.map((o) => (
          <ChoiceTile
            key={o.valor}
            label={o.rotulo}
            sublabel={o.ajuda}
            selected={visita.parecer === o.valor}
            onPress={() => atualizar((v) => ({ ...v, parecer: o.valor }))}
          />
        ))}
      </View>
    </>
  );
}

function Resumo({
  lista,
  grandeDemais,
  irPara,
  onPdf,
  busy,
}: {
  lista: Pendencia[];
  grandeDemais: boolean;
  irPara: (etapa: EtapaId) => void;
  onPdf: () => void;
  busy: boolean;
}) {
  const porEtapa = ETAPAS.map((e) => ({ etapa: e, itens: lista.filter((x) => x.etapa === e.id) })).filter(
    (g) => g.itens.length > 0,
  );

  return (
    <>
      {lista.length === 0 ? (
        <View style={[styles.box, styles.boxOk]}>
          <Icon name="check-circle" size={30} color={colors.leaf} />
          <AppText variant="bodyStrong" style={styles.flex}>
            Tudo respondido. Pode gerar o PDF.
          </AppText>
        </View>
      ) : (
        <View style={styles.group}>
          <AppText variant="heading">
            {lista.length === 1 ? 'Falta 1 resposta' : `Faltam ${lista.length} respostas`}
          </AppText>
          <AppText variant="small" color={colors.inkMuted}>
            Dá para gerar o PDF assim mesmo: o que ficou sem resposta sai em branco na folha.
          </AppText>
          {porEtapa.map(({ etapa, itens }) => (
            <View key={etapa.id} style={[styles.box, styles.boxMissing]}>
              <View style={styles.flex}>
                <View style={styles.missingHead}>
                  <Icon name="alert-circle-outline" size={26} color={colors.clay} />
                  <AppText variant="bodyStrong" style={styles.flex}>
                    {etapa.titulo}
                  </AppText>
                </View>
                {itens.map((x) => (
                  <AppText key={x.rotulo} variant="body">
                    • {x.rotulo}
                  </AppText>
                ))}
                <Button
                  label="Responder agora"
                  variant="secondary"
                  icon="arrow-right"
                  hint={etapa.titulo}
                  style={styles.answerNow}
                  onPress={() => irPara(etapa.id)}
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {grandeDemais ? (
        <View style={[styles.box, styles.boxMissing]}>
          <Icon name="cloud-off-outline" size={26} color={colors.clay} />
          <AppText variant="body" style={styles.flex}>
            Esta visita ficou grande demais para a cópia na internet. Ela continua guardada neste celular.
          </AppText>
        </View>
      ) : null}

      <Button label="Gerar PDF da visita" icon="file-pdf-box" size="xl" busy={busy} onPress={onPdf} />
      <AppText variant="small" color={colors.inkMuted}>
        A folha tem as respostas de cada etapa, o que precisa corrigir, o parecer e linhas para o produtor visitado
        e duas pessoas que visitaram assinarem. É um roteiro de apoio: não substitui o roteiro nem os documentos
        oficiais do seu grupo (OPAC).
      </AppText>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { gap: space.sm },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  saved: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: TOUCH_MIN,
    minHeight: TOUCH_MIN,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.leaf,
    backgroundColor: colors.surface,
  },
  chipWide: { paddingHorizontal: space.lg },
  chipOn: { backgroundColor: colors.leaf },
  chipPressed: { backgroundColor: colors.surfaceSunk },
  footerRow: { flexDirection: 'row', gap: space.sm },
  group: { gap: space.sm },
  ficha: { gap: space.sm, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.leafSoft },
  nc: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  boxOk: { borderColor: colors.leaf, backgroundColor: colors.leafSoft },
  boxMissing: { borderColor: colors.clay, backgroundColor: colors.claySoft },
  missingHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.xs },
  answerNow: { marginTop: space.sm },
  cameraWrap: { flex: 1, backgroundColor: colors.ink },
  cameraText: { padding: space.lg },
  camera: { flex: 1 },
  cameraFooter: { padding: space.lg },
});
