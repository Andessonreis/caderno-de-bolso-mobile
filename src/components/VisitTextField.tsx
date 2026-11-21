import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { cortarNoLimite, letrasRestantes } from '@/lib/roteiro';
import { colors, space } from '@/theme';

import { AppText } from './AppText';
import { Field } from './Field';

/** Espera depois da última letra antes de salvar o texto no celular. */
export const ESPERA_DIGITACAO_MS = 400;

/**
 * Textos digitados que ainda esperam para ser salvos. A tela da visita guarda
 * a função que salva cada um, para salvar tudo antes de sair ou quando o app
 * vai para segundo plano.
 */
export interface Rascunhos {
  guardar: (id: string, salvarAgora: () => void) => void;
  soltar: (id: string) => void;
}

export const RascunhosContext = createContext<Rascunhos | null>(null);

type FieldProps = Parameters<typeof Field>[0];

interface VisitTextFieldProps extends Omit<FieldProps, 'value' | 'onChangeText' | 'maxLength'> {
  value: string;
  /** Recebe o texto quando é hora de salvar (pausa na digitação, saída do campo ou da tela). */
  onSave: (texto: string) => void;
  /** Limite em letras (LIMITES_VISITA). */
  limite: number;
}

/**
 * Campo de texto da visita. O que é digitado fica na tela e vai para o celular
 * depois de uma pausa curta, ao sair do campo, ao sair da tela ou quando o app
 * vai para segundo plano: salvar a cada letra deixava a digitação lenta.
 */
export function VisitTextField({ value, onSave, limite, onBlur, ...field }: VisitTextFieldProps) {
  const rascunhos = useContext(RascunhosContext);
  const id = useId();
  const [texto, setTexto] = useState(value);
  /** Último valor que este campo e o celular têm em comum. */
  const [emComum, setEmComum] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef<(() => void) | null>(null);

  // O valor mudou por fora (ficha lida, outro celular): mostra o novo.
  if (value !== emComum) {
    setEmComum(value);
    setTexto(value);
  }

  const salvarAgora = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const salvar = pendente.current;
    pendente.current = null;
    salvar?.();
  };

  const mudar = (novo: string) => {
    const cabe = cortarNoLimite(novo, limite);
    setTexto(cabe);
    pendente.current = () => {
      rascunhos?.soltar(id);
      setEmComum(cabe);
      onSave(cabe);
    };
    rascunhos?.guardar(id, salvarAgora);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(salvarAgora, ESPERA_DIGITACAO_MS);
  };

  // Campo que sai da tela (troca de etapa) salva o que ficou esperando.
  useEffect(() => {
    const t = timer;
    const p = pendente;
    return () => {
      if (t.current) clearTimeout(t.current);
      const salvar = p.current;
      p.current = null;
      salvar?.();
    };
  }, []);

  const restam = letrasRestantes(texto, limite);
  const perto = restam <= Math.max(10, Math.floor(limite / 5));
  const contador =
    restam === 0 ? 'Não cabem mais letras' : restam === 1 ? 'Ainda cabe 1 letra' : `Ainda cabem ${restam} letras`;

  return (
    <View style={styles.wrap}>
      <Field
        {...field}
        value={texto}
        onChangeText={mudar}
        maxLength={limite}
        onBlur={(e) => {
          salvarAgora();
          onBlur?.(e);
        }}
      />
      {perto ? (
        <AppText variant="small" color={restam === 0 ? colors.clay : colors.inkMuted}>
          {contador}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
});
