// Visitas enviadas para o grupo (núcleo, associação ou cooperativa). Quem
// coordena cria o grupo no site e passa o código aos produtores; quem tem o
// código só envia, não lê as visitas dos outros. Funções puras.

import { MAX_RECORD_BYTES, visitaDados } from '@/sync/records';

import { type Visita, bytesUtf8 } from './roteiro';

/** Letras e números do código (sem I, L, O, 0 e 1, que se confundem). */
export const ALFABETO_GRUPO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TAMANHO_CODIGO = 10;

const CODIGO_RE = new RegExp(`^[${ALFABETO_GRUPO}]{${TAMANHO_CODIGO}}$`);

/** O servidor aceita até 50 visitas por chamada. */
export const MAX_LOTE_GRUPO = 50;

export interface Grupo {
  /** Código limpo, sem traço (ex.: "ABCDE23456"). */
  codigo: string;
  nome: string;
  /** ISO 8601 */
  ligadoEm: string;
}

/** Visita já aceita pelo grupo: id → `updatedAt` da versão aceita. */
export type EnviadasAoGrupo = Record<string, string>;

/** Uma visita como o servidor do grupo recebe. */
export interface VisitaParaGrupo {
  id: string;
  dados: Record<string, unknown>;
  atualizado_em: string;
  apagado_em: string | null;
}

/** Deixa o código como o servidor guarda: maiúsculas, sem espaços nem traços. */
export function limparCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function codigoValido(codigo: string): boolean {
  return CODIGO_RE.test(limparCodigo(codigo));
}

/** Mostra o código como XXXXX-XXXXX (também no meio da digitação). */
export function formatarCodigo(texto: string): string {
  const limpo = limparCodigo(texto).slice(0, TAMANHO_CODIGO);
  return limpo.length > 5 ? `${limpo.slice(0, 5)}-${limpo.slice(5)}` : limpo;
}

export const LINK_GRUPO = 'cadernodebolso://grupo';

export function linkDoGrupo(codigo: string): string {
  return `${LINK_GRUPO}?c=${formatarCodigo(codigo)}`;
}

/**
 * Lê o código digitado, colado ou lido do QR: o link cadernodebolso://grupo?c=...
 * ou só o código. Devolve o código limpo, ou null se não for um código de grupo.
 */
export function codigoDoTexto(texto: string): string | null {
  const t = texto.trim();
  let bruto = t;
  if (t.includes('?')) {
    const partes = t.slice(t.indexOf('?') + 1).split('&');
    const c = partes.find((p) => p.startsWith('c='));
    if (!c) return null;
    try {
      bruto = decodeURIComponent(c.slice(2));
    } catch {
      return null;
    }
  } else if (t.includes('://')) {
    return null;
  }
  const codigo = limparCodigo(bruto);
  return CODIGO_RE.test(codigo) ? codigo : null;
}

/** A visita ainda não tem o nome do produtor visitado (rascunho que não vai para o grupo). */
function semNome(v: Visita): boolean {
  return v.produtor.nome.trim() === '';
}

/** Visita (ou exclusão) no formato do servidor. Visita apagada vai sem os dados. */
export function paraGrupo(v: Visita): VisitaParaGrupo {
  return {
    id: v.id,
    dados: v.deletedAt ? {} : visitaDados(v),
    atualizado_em: v.updatedAt,
    apagado_em: v.deletedAt ?? null,
  };
}

/** Maior do que o servidor aceita por visita (mesma folga da cópia na internet). */
export function grandeDemaisParaGrupo(r: VisitaParaGrupo): boolean {
  return bytesUtf8(JSON.stringify(r)) > MAX_RECORD_BYTES;
}

export type SituacaoNoGrupo =
  /** O grupo já tem esta versão. */
  | 'enviada'
  /** Mudou desde o último envio (ou nunca foi). */
  | 'falta'
  /** Rascunho sem o nome do produtor: não vai. */
  | 'sem_nome'
  /** Não cabe no limite do servidor: não vai até diminuir. */
  | 'grande_demais'
  /** Apagada antes de ir: não há nada a avisar ao grupo. */
  | 'fora';

export function situacaoNoGrupo(v: Visita, enviadas: EnviadasAoGrupo): SituacaoNoGrupo {
  const aceita = enviadas[v.id];
  if (aceita === v.updatedAt) return v.deletedAt ? 'fora' : 'enviada';
  if (v.deletedAt) return aceita ? 'falta' : 'fora';
  if (!aceita && semNome(v)) return 'sem_nome';
  return grandeDemaisParaGrupo(paraGrupo(v)) ? 'grande_demais' : 'falta';
}

export interface SelecaoParaGrupo {
  enviar: VisitaParaGrupo[];
  /** Ids das visitas que não cabem no limite do servidor. */
  grandes: string[];
}

/**
 * O que precisa ir para o grupo: visitas com o nome do produtor que mudaram
 * desde a última vez que o grupo aceitou, e as exclusões de visitas que o grupo
 * já tinha. Visita grande demais fica de fora (e é apontada), sem travar o resto.
 */
export function visitasParaEnviar(visitas: Visita[], enviadas: EnviadasAoGrupo): SelecaoParaGrupo {
  const enviar: VisitaParaGrupo[] = [];
  const grandes: string[] = [];
  for (const v of visitas) {
    const s = situacaoNoGrupo(v, enviadas);
    if (s === 'falta') enviar.push(paraGrupo(v));
    else if (s === 'grande_demais') grandes.push(v.id);
  }
  return { enviar, grandes };
}

/** Quantas visitas ainda faltam ir para o grupo. */
export function faltamParaGrupo(visitas: Visita[], enviadas: EnviadasAoGrupo): number {
  return visitasParaEnviar(visitas, enviadas).enviar.length;
}
