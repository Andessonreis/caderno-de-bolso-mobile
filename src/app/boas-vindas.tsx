import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { AreasEditor } from '@/components/AreasEditor';
import { Button } from '@/components/Button';
import { CropPicker } from '@/components/CropPicker';
import { Icon, type IconName } from '@/components/Icon';
import { ProfileBasicFields, ProfileCertFields, tidyProfile, validCertYear } from '@/components/ProfileFields';
import { Screen } from '@/components/Screen';
import { StepProgress } from '@/components/StepProgress';
import { today } from '@/lib/dates';
import type { Area, Profile } from '@/lib/types';
import { newId, useApp } from '@/store';
import { colors, radius, space } from '@/theme';

const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'gesture-tap', text: 'Anote na hora, só tocando: área, cultura, o que fez e a quantidade.' },
  { icon: 'notebook-edit-outline', text: 'Depois veja tudo arrumado na ordem do caderno, para passar a limpo mais rápido.' },
  { icon: 'wifi-off', text: 'Funciona sem internet. Seus dados ficam só neste celular.' },
];

export default function BoasVindas() {
  const completeOnboarding = useApp((s) => s.completeOnboarding);
  const loadSample = useApp((s) => s.loadSample);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>({ name: '' });
  const [areas, setAreas] = useState<Area[]>([]);
  const [crops, setCrops] = useState<string[]>([]);

  const finish = () => {
    completeOnboarding(tidyProfile(profile), areas, crops);
    router.replace('/');
  };

  const sample = () => {
    loadSample(today());
    router.replace('/');
  };

  if (step === 0) {
    return (
      <Screen
        footer={
          <>
            <Button label="Começar" icon="arrow-right" size="xl" onPress={() => setStep(1)} />
            <Button
              label="Ver com dados de exemplo"
              icon="eye-outline"
              variant="secondary"
              hint="Carrega um produtor fictício para conhecer o app"
              onPress={sample}
            />
          </>
        }>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Icon name="notebook-outline" size={48} color={colors.onLeaf} />
          </View>
          <AppText variant="display">Caderno de Bolso</AppText>
          <AppText variant="body" color={colors.inkMuted}>
            Um ajudante do seu caderno de campo. Ele não substitui o caderno: ajuda a anotar na hora e a passar a limpo.
          </AppText>
        </View>
        {POINTS.map((p) => (
          <View key={p.icon} style={styles.point}>
            <Icon name={p.icon} size={30} color={colors.leaf} />
            <AppText variant="body" style={styles.flex}>
              {p.text}
            </AppText>
          </View>
        ))}
      </Screen>
    );
  }

  const nameOk = profile.name.trim().length > 0;
  const yearOk = validCertYear(profile.certifiedSince, new Date().getFullYear());

  if (step === 1) {
    return (
      <Screen
        back
        onBack={() => setStep(0)}
        top={<StepProgress step={1} total={3} />}
        title="Quem é você?"
        subtitle="Só o nome é obrigatório."
        footer={
          <Button label="Próximo" icon="arrow-right" size="xl" disabled={!nameOk} onPress={() => setStep(2)} />
        }>
        <ProfileBasicFields value={profile} onChange={setProfile} />
      </Screen>
    );
  }

  if (step === 2) {
    return (
      <Screen
        back
        onBack={() => setStep(1)}
        top={<StepProgress step={2} total={3} />}
        title="Sua certificação"
        subtitle="Tudo aqui é opcional. Você pode preencher depois em Mais > Meus dados."
        footer={
          <>
            {!yearOk ? (
              <AppText variant="small" color={colors.danger}>
                O ano do certificado parece errado.
              </AppText>
            ) : null}
            <Button label="Próximo" icon="arrow-right" size="xl" disabled={!yearOk} onPress={() => setStep(3)} />
          </>
        }>
        <ProfileCertFields value={profile} onChange={setProfile} />
      </Screen>
    );
  }

  const ready = areas.length > 0 && crops.length > 0;
  const missing = [areas.length === 0 ? 'pelo menos uma área' : '', crops.length === 0 ? 'pelo menos uma cultura' : '']
    .filter(Boolean)
    .join(' e ');
  return (
    <Screen
      back
      onBack={() => setStep(2)}
      top={<StepProgress step={3} total={3} />}
      title="Sua roça"
      subtitle="Cadastre as áreas e marque o que você planta. Dá para mudar depois."
      footer={
        <>
          {!ready ? (
            <AppText variant="small" color={colors.inkMuted}>
              Falta {missing}.
            </AppText>
          ) : null}
          <Button label="Pronto, começar a anotar" icon="check" size="xl" disabled={!ready} onPress={finish} />
        </>
      }>
      <View style={styles.section}>
        <AppText variant="heading">Áreas da roça</AppText>
        <AppText variant="small" color={colors.inkMuted}>
          Um nome curto para cada canteiro ou pedaço de terra.
        </AppText>
        <AreasEditor
          areas={areas}
          onAdd={(name) => setAreas((a) => [...a, { id: newId(), name, updatedAt: new Date().toISOString() }])}
          onRename={(id, name) => setAreas((a) => a.map((x) => (x.id === id ? { ...x, name: name.trim() } : x)))}
          onRemove={(area) => setAreas((a) => a.filter((x) => x.id !== area.id))}
        />
      </View>
      <View style={styles.section}>
        <AppText variant="heading">O que você planta</AppText>
        <CropPicker selected={crops} onChange={setCrops} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { gap: space.md, marginTop: space.lg },
  logo: {
    width: 84,
    height: 84,
    borderRadius: radius.lg,
    backgroundColor: colors.leaf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  point: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  flex: { flex: 1 },
  section: { gap: space.md },
});
