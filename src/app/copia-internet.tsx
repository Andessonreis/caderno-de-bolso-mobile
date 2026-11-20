import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { SyncIndicator } from '@/components/SyncIndicator';
import { errorMessage, printHtml } from '@/lib/device';
import { recoveryCardHtml } from '@/lib/html';
import { QR_ECL, qrSvg } from '@/lib/qr';
import { SYNC_AVAILABLE } from '@/sync/device';
import { buildLink } from '@/sync/links';
import { deleteCloudCopy, loadCredentials, requestSync, stopSync, useSyncStatus } from '@/sync/service';
import { useApp } from '@/store';
import { colors, radius, space } from '@/theme';

type Dialog = null | 'parar' | 'apagar1' | 'apagar2';

export default function CopiaInternet() {
  const ligado = useApp((s) => s.sync.ligado);
  const profile = useApp((s) => s.profile);
  const setSyncEnabled = useApp((s) => s.setSyncEnabled);
  const fase = useSyncStatus((s) => s.fase);
  const [code, setCode] = useState<string | null>(null);
  const [noAccountYet, setNoAccountYet] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const turnOn = () => {
    setSyncEnabled(true);
    requestSync();
  };

  const showCode = async () => {
    const c = await loadCredentials();
    if (!c) {
      setNoAccountYet(true);
      requestSync();
      return;
    }
    setNoAccountYet(false);
    setCode(buildLink(c));
  };

  const shareCode = async () => {
    if (!code) return;
    try {
      await Share.share({ message: code });
    } catch (e) {
      Alert.alert('Compartilhar', errorMessage(e));
    }
  };

  const printCard = async () => {
    const c = await loadCredentials();
    if (!c) {
      setNoAccountYet(true);
      return;
    }
    const link = buildLink(c);
    try {
      await printHtml(recoveryCardHtml({ name: profile?.name ?? '', qrSvg: qrSvg(link), code: link }));
    } catch (e) {
      Alert.alert('Cartão', errorMessage(e));
    }
  };

  const doDelete = async () => {
    setDialog(null);
    setBusy(true);
    const r = await deleteCloudCopy();
    setBusy(false);
    setCode(null);
    if (r === 'ok') Alert.alert('Cópia apagada', 'A cópia na internet foi apagada. Tudo continua guardado neste celular.');
    else if (r === 'sem_internet') Alert.alert('Sem internet', 'Para apagar a cópia, o celular precisa estar com internet. Tente de novo depois.');
    else Alert.alert('Não deu certo', 'Não foi possível apagar agora. Tente de novo mais tarde.');
  };

  if (!SYNC_AVAILABLE) {
    return (
      <Screen back title="Cópia na internet">
        <AppText variant="body">A cópia na internet funciona no app do celular.</AppText>
      </Screen>
    );
  }

  if (profile?.exemplo) {
    return (
      <Screen back title="Cópia na internet">
        <SyncIndicator />
        <AppText variant="body">
          Os dados de exemplo ficam só neste celular. Quando você apagar o exemplo e cadastrar os seus dados, poderá guardar
          uma cópia na internet.
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="Cópia na internet"
      subtitle="Uma cópia do seu caderno guardada na internet, para não perder nada se o celular quebrar ou sumir.">
      <SyncIndicator />

      {fase === 'chave' ? (
        <View style={styles.warn}>
          <AppText variant="body">
            Este celular perdeu a ligação com a cópia na internet. Seus dados continuam aqui. Use o código ou o cartão de
            recuperação para ligar de novo.
          </AppText>
          <Button label="Ligar de novo" icon="link-variant" onPress={() => router.push('/ligar')} />
        </View>
      ) : null}

      {!ligado ? (
        <View style={styles.box}>
          <AppText variant="heading">Quer guardar uma cópia na internet para não perder se o celular quebrar?</AppText>
          <AppText variant="body" color={colors.inkMuted}>
            O app envia sozinho quando tiver internet. Sem internet, tudo continua funcionando e fica guardado no celular.
            Não precisa de e-mail nem senha.
          </AppText>
          <Button label="Sim, guardar na internet" icon="cloud-upload-outline" size="xl" onPress={turnOn} />
          <Button label="Agora não" variant="quiet" onPress={() => router.back()} />
        </View>
      ) : (
        <>
          <View style={styles.box}>
            <AppText variant="heading">Ligar outro celular</AppText>
            <AppText variant="body" color={colors.inkMuted}>
              No outro celular, abra o Caderno de Bolso, toque em &quot;Já tenho um caderno&quot; e aponte a câmera para o
              código.
            </AppText>
            {code ? (
              <>
                <View style={styles.qr} accessible accessibilityRole="image" accessibilityLabel="Código para ligar outro celular">
                  <QRCode value={code} size={240} ecl={QR_ECL} quietZone={10} />
                </View>
                <AppText variant="small" selectable style={styles.code}>
                  {code}
                </AppText>
                <View style={styles.warnSmall}>
                  <AppText variant="bodyStrong" color={colors.clay}>
                    Atenção: quem tiver este código vê e muda o seu caderno. Mostre só para quem você confia.
                  </AppText>
                </View>
                <Button label="Compartilhar código" icon="share-variant" variant="secondary" onPress={shareCode} />
                <Button label="Esconder código" variant="quiet" onPress={() => setCode(null)} />
              </>
            ) : (
              <Button label="Mostrar código para ligar" icon="qrcode" onPress={showCode} />
            )}
            {noAccountYet ? (
              <AppText variant="body" color={colors.warn}>
                A cópia ainda está sendo criada. Ela fica pronta quando o celular tiver internet; depois toque de novo.
              </AppText>
            ) : null}
          </View>

          <View style={styles.box}>
            <AppText variant="heading">Cartão de recuperação</AppText>
            <AppText variant="body" color={colors.inkMuted}>
              Um papel com o código, para guardar em casa. Se trocar de celular, é só ler o cartão.
            </AppText>
            <Button label="Imprimir cartão de recuperação" icon="printer-outline" variant="secondary" onPress={printCard} />
          </View>

          <View style={styles.box}>
            <Button label="Parar de guardar na internet" variant="secondary" onPress={() => setDialog('parar')} />
            <Button
              label="Apagar minha cópia da internet"
              icon="trash-can-outline"
              variant="danger"
              busy={busy}
              onPress={() => setDialog('apagar1')}
            />
          </View>
        </>
      )}

      <ConfirmDialog
        visible={dialog === 'parar'}
        title="Parar de guardar na internet?"
        message="As próximas anotações ficam só neste celular. A cópia que já está na internet continua lá."
        confirmLabel="Sim, parar"
        onConfirm={() => {
          stopSync();
          setDialog(null);
        }}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        visible={dialog === 'apagar1'}
        title="Apagar a cópia da internet?"
        message="A cópia na internet (anotações, fotos e recados) será apagada. O que está neste celular continua."
        confirmLabel="Sim, quero apagar"
        danger
        onConfirm={() => setDialog('apagar2')}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        visible={dialog === 'apagar2'}
        title="Tem certeza?"
        message="Isso não tem volta. Outros celulares ligados a este caderno também perdem a cópia."
        confirmLabel="Apagar de vez"
        danger
        onConfirm={doDelete}
        onCancel={() => setDialog(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  warn: { gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.warnSoft },
  warnSmall: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.claySoft },
  qr: { alignSelf: 'center', padding: space.md, backgroundColor: colors.white, borderRadius: radius.md },
  code: { fontFamily: 'monospace' },
});
