import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { GroupJoinForm } from '@/components/GroupCard';
import { Screen } from '@/components/Screen';
import { codigoDoTexto } from '@/lib/grupo';
import { SYNC_AVAILABLE } from '@/sync/device';
import { colors, space } from '@/theme';

/**
 * Entrar no grupo que recebe as visitas: digitando o código, lendo o QR com a
 * câmera ou pelo link cadernodebolso://grupo?c=XXXXX-XXXXX.
 */
export default function Grupo() {
  const params = useLocalSearchParams<{ c?: string | string[] }>();
  // Link com `c=` repetido chega como lista: vale o primeiro.
  const c = Array.isArray(params.c) ? params.c[0] : params.c;
  // O link pode chegar com esta tela já aberta. A chave refaz a tela com o código novo.
  return <GrupoFlow key={c ?? ''} c={c} />;
}

function GrupoFlow({ c }: { c?: string }) {
  const doLink = c ? codigoDoTexto(c) : null;
  const [codigo, setCodigo] = useState(doLink ?? '');
  const [camera, setCamera] = useState(false);
  const [aviso, setAviso] = useState<string | null>(
    c && !doLink ? 'Esse link não tem um código de grupo. Confira com quem coordena o grupo.' : null,
  );
  const [pronto, setPronto] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scanned = useRef(false);

  // Com a câmera aberta, o voltar do celular fecha a câmera em vez de sair da tela.
  useEffect(() => {
    if (!camera) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setCamera(false);
      return true;
    });
    return () => sub.remove();
  }, [camera]);

  const voltar = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: '/visita', params: { modo: 'outra' } });

  const abrirCamera = async () => {
    setAviso(null);
    const p = permission?.granted ? permission : await requestPermission();
    if (!p.granted) {
      setAviso('Para ler o código, o app precisa da permissão da câmera. Libere nas configurações do celular ou digite o código.');
      return;
    }
    scanned.current = false;
    setCamera(true);
  };

  if (!SYNC_AVAILABLE) {
    return (
      <Screen back title="Enviar as visitas para o grupo">
        <AppText variant="body">Enviar as visitas para o grupo funciona no app do celular.</AppText>
      </Screen>
    );
  }

  if (camera) {
    return (
      <SafeAreaView style={styles.cameraWrap}>
        <AppText variant="heading" color={colors.white} center style={styles.cameraText}>
          Aponte para o código do grupo
        </AppText>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            if (scanned.current) return;
            const lido = codigoDoTexto(data);
            if (!lido) return;
            scanned.current = true;
            setCodigo(lido);
            setCamera(false);
          }}
        />
        <View style={styles.cameraFooter}>
          <Button label="Cancelar" variant="secondary" onPress={() => setCamera(false)} />
        </View>
      </SafeAreaView>
    );
  }

  if (pronto) {
    return (
      <Screen
        title="Pronto!"
        footer={
          <Button
            label="Ver as visitas"
            icon="clipboard-text-outline"
            size="xl"
            onPress={() => router.replace({ pathname: '/visita', params: { modo: 'outra' } })}
          />
        }>
        <AppText variant="body">
          As visitas deste celular e as que você fizer vão para {pronto} sempre que houver internet. Elas continuam
          guardadas neste celular.
        </AppText>
      </Screen>
    );
  }

  return (
    <Screen
      back
      onBack={voltar}
      title="Enviar as visitas para o grupo"
      subtitle="Quem coordena o grupo (núcleo, associação ou cooperativa) passa o código. Com ele, as visitas deste celular e as que você fizer vão para a coordenação.">
      <GroupJoinForm key={codigo} inicial={codigo} onCamera={abrirCamera} onJoined={setPronto} />
      {aviso ? (
        <AppText variant="bodyStrong" color={colors.danger} accessibilityRole="alert">
          {aviso}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraWrap: { flex: 1, backgroundColor: colors.ink },
  cameraText: { padding: space.lg },
  camera: { flex: 1 },
  cameraFooter: { padding: space.lg },
});
