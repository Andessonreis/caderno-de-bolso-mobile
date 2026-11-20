import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { capitalize } from '@/lib/catalog';
import { formatShortDate } from '@/lib/dates';
import { UserFacingError, errorMessage, printHtml, sharePdf } from '@/lib/device';
import { fichaFromProfile, fichaUrl } from '@/lib/ficha';
import { cardHtml } from '@/lib/html';
import { QR_ECL, qrSvg } from '@/lib/qr';
import { lastEntryDate, useApp } from '@/store';
import { colors, radius, space } from '@/theme';

function Line({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View style={styles.line}>
      <AppText variant="small" color={colors.inkMuted}>
        {label}
      </AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

export default function Ficha() {
  const profile = useApp((s) => s.profile);
  const crops = useApp((s) => s.crops);
  const entries = useApp((s) => s.entries);
  const [busy, setBusy] = useState<'print' | 'pdf' | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  if (!profile) return null;
  const ficha = fichaFromProfile(profile, crops, lastEntryDate(entries));
  const url = fichaUrl(ficha);

  const card = () =>
    cardHtml({
      name: profile.name,
      cooperative: profile.cooperative,
      municipality: profile.municipality,
      qrSvg: qrSvg(url),
      url,
    });

  const run = async (kind: 'print' | 'pdf') => {
    setBusy(kind);
    try {
      if (qrError === url) throw new UserFacingError('Não deu para montar o código. Encurte algum campo em Meus dados.');
      if (kind === 'print') await printHtml(card());
      else await sharePdf(card(), 'cartao-ficha');
    } catch (e) {
      Alert.alert('Cartão', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const shareLink = async () => {
    try {
      await Share.share({ message: `Conheça quem produziu: ${profile.name}\n${url}` });
    } catch (e) {
      Alert.alert('Compartilhar', errorMessage(e));
    }
  };

  return (
    <Screen
      back
      title="Minha ficha"
      subtitle="Mostre este código ao comprador. Ele aponta a câmera do celular e vê quem produziu.">
      <View style={styles.qrBox} accessible accessibilityRole="image" accessibilityLabel={`Código QR da ficha de ${profile.name}`}>
        {qrError === url ? (
          <View style={styles.qrError} accessibilityRole="alert">
            <AppText variant="bodyStrong" center>
              Não deu para montar o código.
            </AppText>
            <AppText variant="body" color={colors.inkMuted} center>
              Os dados ficaram grandes demais para caber no QR. Encurte algum campo em Meus dados (nome, cooperativa ou
              certificado) e tente de novo.
            </AppText>
          </View>
        ) : (
          <QRCode
            value={url}
            size={260}
            ecl={QR_ECL}
            backgroundColor="#FFFFFF"
            color="#000000"
            quietZone={12}
            onError={() => setQrError(url)}
          />
        )}
        <AppText variant="small" color={colors.inkMuted} center>
          Quem ler o código precisa de internet para abrir a ficha. O seu celular não precisa.
        </AppText>
      </View>

      <View style={styles.preview}>
        <AppText variant="heading">O que aparece na ficha</AppText>
        <Line label="Produtor" value={ficha.n} />
        <Line label="Município" value={ficha.m} />
        <Line label="Cooperativa ou núcleo" value={ficha.c} />
        <Line label="Quem certifica (OPAC)" value={ficha.o} />
        <Line label="Certificado" value={ficha.ct} />
        <Line label="Certificado desde" value={ficha.d ? String(ficha.d) : undefined} />
        <Line label="Cadastro nacional de produtores orgânicos" value={ficha.r} />
        <Line label="Código de rastreio" value={ficha.s} />
        <Line label="Culturas" value={ficha.cu?.map(capitalize).join(', ')} />
        <Line label="Última anotação" value={ficha.u ? formatShortDate(ficha.u) : undefined} />
        <AppText variant="small" color={colors.inkMuted}>
          Fotos e anotações não vão na ficha. Só o que está aqui em cima.
        </AppText>
        <Button label="Mudar meus dados" variant="quiet" icon="pencil-outline" onPress={() => router.push('/perfil')} />
      </View>

      <Button label="Compartilhar link" icon="share-variant" onPress={shareLink} />
      <Button
        label="Imprimir cartão"
        icon="printer-outline"
        variant="secondary"
        busy={busy === 'print'}
        disabled={busy !== null}
        onPress={() => run('print')}
      />
      <Button
        label="Cartão em PDF"
        icon="file-pdf-box"
        variant="secondary"
        busy={busy === 'pdf'}
        disabled={busy !== null}
        onPress={() => run('pdf')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrBox: {
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.leaf,
  },
  preview: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  qrError: { width: 260, minHeight: 200, justifyContent: 'center', gap: space.sm },
  line: { gap: 2, paddingVertical: space.xs, borderBottomWidth: 1, borderBottomColor: colors.line },
});
