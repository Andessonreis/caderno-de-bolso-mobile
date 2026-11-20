import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { colors, radius, space } from '@/theme';

const ITEMS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'notebook-outline',
    title: 'Ajudante do caderno de campo',
    text: 'O caderno de papel continua sendo o seu registro. O app serve para anotar na hora, sem esquecer, e para passar a limpo mais rápido.',
  },
  {
    icon: 'cellphone-lock',
    title: 'Seus dados ficam no seu celular',
    text: 'Não tem conta, senha nem nuvem. Nada sai do aparelho, a não ser quando você mesmo compartilha um PDF, o link da ficha ou o arquivo de cópia.',
  },
  {
    icon: 'wifi-off',
    title: 'Funciona sem internet',
    text: 'Anotar, ver resumos, fotografar o caderno e gerar PDFs funcionam sem sinal.',
  },
  {
    icon: 'calculator-variant-outline',
    title: 'Resumos só somam',
    text: 'Os resumos apenas agrupam e somam o que você anotou. O app não inventa nem completa nada.',
  },
  {
    icon: 'school-outline',
    title: 'Projeto acadêmico',
    text: 'Protótipo feito na disciplina de Empreendedorismo do curso de Análise e Desenvolvimento de Sistemas do IFBA, campus Irecê, a partir de conversas com agricultores agroecológicos do Território de Irecê.',
  },
];

export default function Sobre() {
  return (
    <Screen back title="Sobre o Caderno de Bolso">
      {ITEMS.map((i) => (
        <View key={i.title} style={styles.item}>
          <Icon name={i.icon} size={30} color={colors.leaf} />
          <View style={styles.text}>
            <AppText variant="bodyStrong">{i.title}</AppText>
            <AppText variant="body" color={colors.inkMuted}>
              {i.text}
            </AppText>
          </View>
        </View>
      ))}
      <AppText variant="small" color={colors.inkMuted}>
        A lista de conferência da visita é uma lista de apoio. Ela não é o roteiro oficial de nenhum grupo ou
        certificadora.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  text: { flex: 1, gap: space.xs },
});
