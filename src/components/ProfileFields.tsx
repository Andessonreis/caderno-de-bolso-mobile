import { View } from 'react-native';

import type { Profile } from '@/lib/types';
import { space } from '@/theme';

import { Field } from './Field';

interface Props {
  value: Profile;
  onChange: (p: Profile) => void;
}

export function ProfileBasicFields({ value, onChange }: Props) {
  return (
    <View style={{ gap: space.lg }}>
      <Field
        label="Seu nome"
        placeholder="Como você é conhecido"
        value={value.name}
        onChangeText={(name) => onChange({ ...value, name })}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="next"
      />
      <Field
        label="Município"
        optional
        placeholder="Ex.: Irecê-BA"
        value={value.municipality ?? ''}
        onChangeText={(municipality) => onChange({ ...value, municipality })}
        autoCapitalize="words"
      />
    </View>
  );
}

export function ProfileCertFields({ value, onChange }: Props) {
  return (
    <View style={{ gap: space.lg }}>
      <Field
        label="Cooperativa, associação ou núcleo"
        optional
        value={value.cooperative ?? ''}
        onChangeText={(cooperative) => onChange({ ...value, cooperative })}
        autoCapitalize="words"
      />
      <Field
        label="Quem certifica (OPAC)"
        optional
        help="O nome do organismo do seu sistema participativo."
        value={value.opac ?? ''}
        onChangeText={(opac) => onChange({ ...value, opac })}
      />
      <Field
        label="Número ou identificação do certificado"
        optional
        value={value.certificateId ?? ''}
        onChangeText={(certificateId) => onChange({ ...value, certificateId })}
        autoCapitalize="characters"
      />
      <Field
        label="Certificado desde (ano)"
        optional
        placeholder="Ex.: 2020"
        keyboardType="number-pad"
        maxLength={4}
        value={value.certifiedSince ? String(value.certifiedSince) : ''}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '');
          onChange({ ...value, certifiedSince: digits ? Number(digits) : undefined });
        }}
      />
      <Field
        label="Registro no cadastro nacional de produtores orgânicos"
        optional
        value={value.nationalRegistry ?? ''}
        onChangeText={(nationalRegistry) => onChange({ ...value, nationalRegistry })}
        autoCapitalize="characters"
      />
    </View>
  );
}

/** Ano de certificação aceitável (ou vazio). */
export function validCertYear(year: number | undefined, currentYear: number): boolean {
  return year === undefined || (year >= 1980 && year <= currentYear);
}

/** Limpa espaços e campos vazios antes de salvar. */
export function tidyProfile(p: Profile): Profile {
  const t = (s?: string) => (s && s.trim() ? s.trim() : undefined);
  return {
    ...p,
    name: p.name.trim(),
    municipality: t(p.municipality),
    cooperative: t(p.cooperative),
    opac: t(p.opac),
    certificateId: t(p.certificateId),
    nationalRegistry: t(p.nationalRegistry),
    traceCode: t(p.traceCode),
  };
}
