import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { type Item, LIMITES_VISITA, OPCOES_RESPOSTA, type Resposta, type RespostaItem } from '@/lib/roteiro';
import { TOUCH_MIN, colors, radius, space } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { Field } from './Field';
import { Icon, type IconName } from './Icon';

/** Cada resposta tem ícone próprio: dá para distinguir sem depender da cor. */
const ICONE: Record<Resposta, { normal: IconName; marcado: IconName }> = {
  sim: { normal: 'check-circle-outline', marcado: 'check-circle' },
  parte: { normal: 'circle-half-full', marcado: 'circle-half-full' },
  nao: { normal: 'close-circle-outline', marcado: 'close-circle' },
  na: { normal: 'minus-circle-outline', marcado: 'minus-circle' },
};

interface VisitQuestionProps {
  item: Item;
  resposta: RespostaItem | undefined;
  onChange: (nova: RespostaItem) => void;
}

/** Uma pergunta do roteiro: responde com um toque (Sim, Em parte, Não, Não se aplica) e anota se quiser. */
export function VisitQuestion({ item, resposta, onChange }: VisitQuestionProps) {
  const obs = resposta?.obs ?? '';
  const [abrirObs, setAbrirObs] = useState(obs !== '');
  const respondida = Boolean(resposta?.r);

  return (
    <View style={[styles.box, respondida && styles.boxDone]}>
      <AppText variant="bodyStrong">{item.texto}</AppText>
      {item.ajuda ? (
        <AppText variant="small" color={colors.inkMuted}>
          {item.ajuda}
        </AppText>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={item.texto} style={styles.grid}>
        {OPCOES_RESPOSTA.map((o) => {
          const marcado = resposta?.r === o.valor;
          return (
            <Pressable
              key={o.valor}
              accessibilityRole="radio"
              accessibilityLabel={o.rotulo}
              accessibilityState={{ selected: marcado }}
              onPress={() => onChange({ obs, r: o.valor })}
              style={({ pressed }) => [
                styles.option,
                marcado && styles.optionOn,
                pressed && !marcado && { backgroundColor: colors.surfaceSunk },
              ]}>
              <Icon
                name={marcado ? ICONE[o.valor].marcado : ICONE[o.valor].normal}
                size={26}
                color={marcado ? colors.onLeaf : colors.leaf}
              />
              <AppText variant="label" color={marcado ? colors.onLeaf : colors.ink} style={styles.optionText}>
                {o.rotulo}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {abrirObs ? (
        <Field
          label="Observação"
          optional
          value={obs}
          onChangeText={(t) => onChange({ ...resposta, obs: t })}
          maxLength={LIMITES_VISITA.observacao}
          multiline
        />
      ) : (
        <Button
          label="Anotar observação"
          icon="pencil-outline"
          variant="quiet"
          hint={item.texto}
          onPress={() => setAbrirObs(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  boxDone: { borderColor: colors.leaf },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH_MIN,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.leaf,
    backgroundColor: colors.surface,
  },
  optionOn: { backgroundColor: colors.leaf },
  optionText: { flexShrink: 1 },
});
