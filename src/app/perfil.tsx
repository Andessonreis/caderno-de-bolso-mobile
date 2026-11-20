import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import {
  PROFILE_LIMITS,
  ProfileBasicFields,
  ProfileCertFields,
  tidyProfile,
  validCertYear,
} from '@/components/ProfileFields';
import { Screen } from '@/components/Screen';
import { hapticSuccess } from '@/lib/device';
import type { Profile } from '@/lib/types';
import { useApp } from '@/store';
import { colors, space } from '@/theme';

export default function Perfil() {
  const stored = useApp((s) => s.profile);
  const updateProfile = useApp((s) => s.updateProfile);
  const [p, setP] = useState<Profile>(() => stored ?? { name: '' });

  const nameOk = p.name.trim().length > 0;
  const yearOk = validCertYear(p.certifiedSince, new Date().getFullYear());

  const save = () => {
    updateProfile(tidyProfile(p));
    hapticSuccess();
    router.back();
  };

  return (
    <Screen
      back
      title="Meus dados"
      subtitle="Aparecem na sua ficha (QR) e nos PDFs. Só o nome é obrigatório."
      footer={
        <>
          {!nameOk ? (
            <AppText variant="small" color={colors.danger}>
              Escreva seu nome para salvar.
            </AppText>
          ) : null}
          {!yearOk ? (
            <AppText variant="small" color={colors.danger}>
              O ano do certificado parece errado.
            </AppText>
          ) : null}
          <Button label="Salvar" icon="content-save" size="xl" disabled={!nameOk || !yearOk} onPress={save} />
        </>
      }>
      <View style={{ gap: space.xl }}>
        <ProfileBasicFields value={p} onChange={setP} />
        <ProfileCertFields value={p} onChange={setP} />
        <Field
          label="Código do sistema de rastreio que já uso"
          optional
          help="Se você já usa outro sistema de rastreio, coloque o código aqui. Ele entra na sua ficha."
          value={p.traceCode ?? ''}
          onChangeText={(traceCode) => setP({ ...p, traceCode })}
          autoCapitalize="characters"
          maxLength={PROFILE_LIMITS.traceCode}
        />
      </View>
    </Screen>
  );
}
