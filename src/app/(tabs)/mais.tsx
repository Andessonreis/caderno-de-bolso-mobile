import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ChoiceTile } from '@/components/ChoiceTile';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { Segmented } from '@/components/Segmented';
import { useApp } from '@/store';
import { FONT_CHOICES, colors, radius, space } from '@/theme';

type Href = '/perfil' | '/areas-culturas' | '/ficha' | '/copia-seguranca' | '/colheita-venda' | '/sobre';

const MENU: { label: string; sublabel: string; icon: IconName; href: Href }[] = [
  { label: 'Meus dados', sublabel: 'Nome, município, cooperativa e certificado', icon: 'account-outline', href: '/perfil' },
  { label: 'Áreas e culturas', sublabel: 'Canteiros, roças e o que você planta', icon: 'map-marker-outline', href: '/areas-culturas' },
  { label: 'Minha ficha (QR)', sublabel: 'Código para o comprador conhecer quem produziu', icon: 'qrcode', href: '/ficha' },
  {
    label: 'Cópia de segurança',
    sublabel: 'Fotos do caderno de papel, exportar e importar dados',
    icon: 'shield-check-outline',
    href: '/copia-seguranca',
  },
  { label: 'Colheita e venda', sublabel: 'Quanto colheu, vendeu e recebeu', icon: 'scale-balance', href: '/colheita-venda' },
  { label: 'Sobre o app', sublabel: 'Para que serve e onde ficam seus dados', icon: 'information-outline', href: '/sobre' },
];

export default function Mais() {
  const fontSize = useApp((s) => s.fontSize);
  const setFontSize = useApp((s) => s.setFontSize);
  const hasSample = useApp((s) => Boolean(s.profile?.exemplo) || s.entries.some((e) => e.exemplo) || s.areas.some((a) => a.exemplo));
  const removeSample = useApp((s) => s.removeSample);
  const [confirm, setConfirm] = useState(false);

  const doRemoveSample = () => {
    setConfirm(false);
    const wasProfile = removeSample();
    if (wasProfile) router.replace('/boas-vindas');
  };

  return (
    <Screen title="Mais" subtitle="Ajustes e outras partes do app.">
      <View style={styles.list}>
        {MENU.map((m) => (
          <ChoiceTile
            key={m.href}
            role="button"
            label={m.label}
            sublabel={m.sublabel}
            icon={m.icon}
            onPress={() => router.push(m.href)}
          />
        ))}
      </View>

      <View style={styles.box}>
        <AppText variant="heading">Tamanho da letra</AppText>
        <Segmented label="Tamanho da letra" options={FONT_CHOICES} value={fontSize} onChange={setFontSize} />
        <AppText variant="body" color={colors.inkMuted}>
          Assim fica o texto do app. Escolha o que for mais fácil de ler no sol.
        </AppText>
      </View>

      {hasSample ? (
        <View style={styles.box}>
          <AppText variant="heading">Dados de exemplo</AppText>
          <AppText variant="body" color={colors.inkMuted}>
            O produtor fictício e as anotações de exemplo ainda estão no app.
          </AppText>
          <Button label="Apagar dados de exemplo" icon="trash-can-outline" variant="danger" onPress={() => setConfirm(true)} />
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirm}
        title="Apagar dados de exemplo?"
        message="Saem o produtor fictício, as áreas e as anotações de exemplo. O que você anotou nas suas próprias áreas continua."
        confirmLabel="Sim, apagar exemplo"
        danger
        onConfirm={doRemoveSample}
        onCancel={() => setConfirm(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.sm },
  box: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
});
