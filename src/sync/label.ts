// Frase curta que diz ao produtor onde estão os dados dele.

export interface SyncLabelInput {
  available: boolean;
  ligado: boolean;
  fase: 'parado' | 'enviando' | 'sem_internet' | 'erro' | 'chave';
  online: boolean | null;
  pending: number;
  exemplo: boolean;
}

export type SyncTone = 'ok' | 'aviso' | 'neutro';

export interface SyncLabel {
  text: string;
  tone: SyncTone;
  icon: 'cloud-check-outline' | 'cloud-upload-outline' | 'cloud-off-outline' | 'cellphone' | 'link-variant-off';
}

export function syncLabel(i: SyncLabelInput): SyncLabel {
  if (!i.available || i.exemplo || !i.ligado) {
    return { text: 'Guardado só neste celular', tone: 'neutro', icon: 'cellphone' };
  }
  if (i.fase === 'chave') {
    return { text: 'Este celular perdeu a ligação com a cópia na internet. Toque para ligar de novo.', tone: 'aviso', icon: 'link-variant-off' };
  }
  if (i.online === false || i.fase === 'sem_internet') {
    return { text: 'Sem internet: guardado só no celular, envio depois', tone: 'aviso', icon: 'cloud-off-outline' };
  }
  if (i.fase === 'enviando') return { text: 'Enviando…', tone: 'neutro', icon: 'cloud-upload-outline' };
  if (i.pending > 0) {
    return { text: `Faltam ${i.pending} para enviar`, tone: 'neutro', icon: 'cloud-upload-outline' };
  }
  if (i.fase === 'erro') {
    return { text: 'Não deu para enviar agora. O app tenta de novo sozinho.', tone: 'aviso', icon: 'cloud-off-outline' };
  }
  return { text: 'Tudo guardado na internet', tone: 'ok', icon: 'cloud-check-outline' };
}

export interface GroupLabelInput {
  fase: 'parado' | 'enviando' | 'sem_internet' | 'erro' | 'nao_encontrado';
  online: boolean | null;
  /** Visitas que ainda faltam ir para o grupo. */
  faltam: number;
  exemplo: boolean;
}

/** Frase curta que diz se as visitas já chegaram ao grupo. */
export function groupLabel(i: GroupLabelInput): SyncLabel {
  if (i.exemplo) return { text: 'Com os dados de exemplo, nada vai para o grupo', tone: 'neutro', icon: 'cellphone' };
  if (i.fase === 'nao_encontrado') {
    return { text: 'O grupo não foi encontrado. Peça o código de novo.', tone: 'aviso', icon: 'link-variant-off' };
  }
  if (i.faltam === 0) return { text: 'Tudo enviado ao grupo', tone: 'ok', icon: 'cloud-check-outline' };
  if (i.online === false || i.fase === 'sem_internet') {
    return { text: 'Sem internet: envio depois', tone: 'aviso', icon: 'cloud-off-outline' };
  }
  if (i.fase === 'enviando') return { text: 'Enviando ao grupo…', tone: 'neutro', icon: 'cloud-upload-outline' };
  if (i.fase === 'erro') {
    return { text: 'Não deu para enviar agora. O app tenta de novo sozinho.', tone: 'aviso', icon: 'cloud-off-outline' };
  }
  const text = i.faltam === 1 ? 'Falta 1 para enviar' : `Faltam ${i.faltam} para enviar`;
  return { text, tone: 'neutro', icon: 'cloud-upload-outline' };
}
