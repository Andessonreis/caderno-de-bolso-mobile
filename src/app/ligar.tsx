import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { hapticSuccess } from '@/lib/device';
import { SYNC_AVAILABLE } from '@/sync/device';
import { type Credentials, parseLink } from '@/sync/links';
import { linkToAccount } from '@/sync/service';
import { useApp } from '@/store';
import { colors, radius, space } from '@/theme';

type Step = 'escolher' | 'camera' | 'confirmar' | 'ligando' | 'pronto';

/**
 * "Já tenho um caderno": liga este celular a um caderno guardado na internet,
 * lendo o QR do outro celular ou do cartão de recuperação, ou colando o código.
 * Também abre pelo link cadernodebolso://ligar?c=...&k=...
 */
export default function Ligar() {
  const params = useLocalSearchParams<{ c?: string; k?: string }>();
  // O link pode chegar com esta tela já aberta. A chave refaz a tela com o código novo,
  // para a confirmação aparecer do mesmo jeito.
  return <LigarFlow key={`${params.c ?? ''}|${params.k ?? ''}`} params={params} />;
}

function LigarFlow({ params }: { params: { c?: string; k?: string } }) {
  const fromLink = params.c && params.k ? parseLink(`c=${params.c}&k=${params.k}`) : null;
  const hasOwnData = useApp((s) => Boolean(s.profile && !s.profile.exemplo) || s.entries.some((e) => !e.exemplo));
  const [step, setStep] = useState<Step>(fromLink ? 'confirmar' : 'escolher');
  const [cred, setCred] = useState<Credentials | null>(fromLink);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(params.c && !fromLink ? 'Esse código não está completo.' : null);
  const [permission, requestPermission] = useCameraPermissions();
  const scanned = useRef(false);

  const choose = (c: Credentials | null) => {
    if (!c) {
      setError('Esse código não é de um Caderno de Bolso. Confira e tente de novo.');
      return;
    }
    setError(null);
    setCred(c);
    setStep('confirmar');
  };

  const openCamera = async () => {
    setError(null);
    const p = permission?.granted ? permission : await requestPermission();
    if (!p.granted) {
      setError('Para ler o código, o app precisa da permissão da câmera. Libere nas configurações do celular ou cole o código.');
      return;
    }
    scanned.current = false;
    setStep('camera');
  };

  const link = async () => {
    if (!cred) return;
    setStep('ligando');
    const r = await linkToAccount(cred);
    if (r === 'ok') {
      hapticSuccess();
      setStep('pronto');
      return;
    }
    setStep('confirmar');
    setError(
      r === 'nao_confere'
        ? 'Esse código não confere com nenhum caderno. Peça o código de novo no outro celular.'
        : 'Sem internet agora. Para ligar o celular é preciso internet; tente de novo quando tiver sinal.',
    );
  };

  const finish = () => {
    const hasProfile = useApp.getState().profile !== null;
    router.replace(hasProfile ? '/' : '/boas-vindas');
  };

  if (!SYNC_AVAILABLE) {
    return (
      <Screen back title="Já tenho um caderno">
        <AppText variant="body">Ligar a um caderno guardado na internet funciona no app do celular.</AppText>
      </Screen>
    );
  }

  if (step === 'camera') {
    return (
      <SafeAreaView style={styles.cameraWrap}>
        <AppText variant="heading" color={colors.white} center style={styles.cameraText}>
          Aponte para o código do outro celular ou do cartão
        </AppText>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (scanned.current) return;
            const c = parseLink(data);
            if (!c) return;
            scanned.current = true;
            choose(c);
          }}
        />
        <View style={styles.cameraFooter}>
          <Button label="Cancelar" variant="secondary" onPress={() => setStep('escolher')} />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'ligando') {
    return (
      <Screen title="Ligando…">
        <View style={styles.center} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={colors.leaf} />
          <AppText variant="body" center>
            Buscando seu caderno na internet. Pode levar um pouco se tiver muitas fotos.
          </AppText>
        </View>
      </Screen>
    );
  }

  if (step === 'pronto') {
    return (
      <Screen title="Pronto!" footer={<Button label="Abrir o caderno" icon="notebook-outline" size="xl" onPress={finish} />}>
        <AppText variant="body">
          Este celular está ligado ao seu caderno. As anotações feitas aqui e no outro celular ficam juntas sempre que houver
          internet.
        </AppText>
      </Screen>
    );
  }

  if (step === 'confirmar' && cred) {
    return (
      <Screen
        back
        onBack={() => (fromLink ? router.replace('/') : setStep('escolher'))}
        title="Ligar este celular?"
        footer={<Button label="Sim, ligar este celular" icon="link-variant" size="xl" onPress={link} />}>
        <AppText variant="body">
          Este celular vai mostrar e guardar o mesmo caderno do outro celular. Precisa de internet agora para buscar os
          dados.
        </AppText>
        {hasOwnData ? (
          <View style={styles.warn}>
            <AppText variant="body">
              Este celular já tem anotações. Elas serão juntadas ao caderno ligado.
            </AppText>
          </View>
        ) : null}
        {error ? (
          <AppText variant="bodyStrong" color={colors.danger} accessibilityRole="alert">
            {error}
          </AppText>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen
      back
      title="Já tenho um caderno"
      subtitle="Ligue este celular ao caderno que você já guarda na internet, por exemplo num celular novo.">
      <Button label="Ler o código com a câmera" icon="qrcode-scan" size="xl" onPress={openCamera} />
      <AppText variant="small" color={colors.inkMuted}>
        O código aparece no outro celular, em Mais &gt; Cópia na internet, ou no cartão de recuperação.
      </AppText>
      <View style={styles.box}>
        <Field
          label="Ou cole o código"
          placeholder="cadernodebolso://ligar?..."
          value={pasted}
          onChangeText={setPasted}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <Button label="Usar este código" variant="secondary" disabled={!pasted.trim()} onPress={() => choose(parseLink(pasted))} />
      </View>
      {error ? (
        <AppText variant="bodyStrong" color={colors.danger} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: space.lg, marginTop: space.xxl },
  box: { gap: space.sm },
  warn: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.warnSoft },
  cameraWrap: { flex: 1, backgroundColor: colors.ink },
  cameraText: { padding: space.lg },
  camera: { flex: 1 },
  cameraFooter: { padding: space.lg },
});
