// Visitas enviadas para o grupo (núcleo, associação ou cooperativa). Quem
// coordena cria o grupo no site e passa o código aos produtores; quem tem o
// código só envia, não lê as visitas dos outros. Funções puras.

import { type Visita, bytesUtf8 } from './roteiro';

/** Letras e números do código (sem I, L, O, 0 e 1, que se confundem). */
export const ALFABETO_GRUPO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TAMANHO_CODIGO = 10;

const CODIGO_RE = new RegExp(`^[${ALFABETO_GRUPO}]{${TAMANHO_CODIGO}}$`);

/** O servidor aceita até 50 visitas por chamada. */
export const MAX_LOTE_GRUPO = 50;

/** O servidor aceita até 32.768 bytes por visita; a mesma folga da cópia na internet. */
export const MAX_BYTES_GRUPO = 30_000;

export interface Grupo {
  /** Código limpo, sem traço (ex.: "ABCDE23456"). */
  codigo: string;
  nome: string;
  /** ISO 8601 */
  ligadoEm: string;
}

/** Visita já aceita pelo grupo: id → `updatedAt` da versão aceita. */
export type EnviadasAoGrupo = Record<string, string>;

/**
 * Visita que o servidor do grupo recusou sozinha: id → `updatedAt` da versão
 * recusada. Fica de fora até a visita mudar.
 */
export type RecusadasPeloGrupo = Record<string, string>;

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

function semControle(v: Visita): Record<string, unknown> {
  const { id: _id, updatedAt: _updatedAt, deletedAt: _deletedAt, ...dados } = v;
  return dados;
}

/** Visita (ou exclusão) no formato do servidor. Visita apagada vai sem os dados. */
export function paraGrupo(v: Visita): VisitaParaGrupo {
  return {
    id: v.id,
    dados: v.deletedAt ? {} : semControle(v),
    atualizado_em: v.updatedAt,
    apagado_em: v.deletedAt ?? null,
  };
}

/** Maior do que o servidor aceita por visita (mesma folga da cópia na internet). */
export function grandeDemaisParaGrupo(r: VisitaParaGrupo): boolean {
  return bytesUtf8(JSON.stringify(r)) > MAX_BYTES_GRUPO;
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
  /** O servidor recusou esta versão: não vai até a visita mudar. */
  | 'recusada'
  /** Apagada antes de ir: não há nada a avisar ao grupo. */
  | 'fora';

export function situacaoNoGrupo(
  v: Visita,
  enviadas: EnviadasAoGrupo,
  recusadas: RecusadasPeloGrupo = {},
): SituacaoNoGrupo {
  const aceita = enviadas[v.id];
  if (aceita === v.updatedAt) return v.deletedAt ? 'fora' : 'enviada';
  if (v.deletedAt && !aceita) return 'fora';
  if (!v.deletedAt && !aceita && semNome(v)) return 'sem_nome';
  if (!v.deletedAt && grandeDemaisParaGrupo(paraGrupo(v))) return 'grande_demais';
  return recusadas[v.id] === v.updatedAt ? 'recusada' : 'falta';
}

export interface SelecaoParaGrupo {
  enviar: VisitaParaGrupo[];
  /** Ids, dentre as de `enviar`, das visitas que o grupo nunca aceitou (contam no limite do grupo). */
  novas: Set<string>;
  /** Ids das visitas que não cabem no limite do servidor. */
  grandes: string[];
  /** Ids das visitas que o servidor recusou (até mudarem). */
  recusadas: string[];
}

/**
 * O que precisa ir para o grupo: visitas com o nome do produtor que mudaram
 * desde a última vez que o grupo aceitou, e as exclusões de visitas que o grupo
 * já tinha. Visita grande demais fica de fora (e é apontada), sem travar o resto.
 */
export function visitasParaEnviar(
  visitas: Visita[],
  enviadas: EnviadasAoGrupo,
  recusadas: RecusadasPeloGrupo = {},
): SelecaoParaGrupo {
  const sel: SelecaoParaGrupo = { enviar: [], novas: new Set(), grandes: [], recusadas: [] };
  for (const v of visitas) {
    const s = situacaoNoGrupo(v, enviadas, recusadas);
    if (s === 'falta') {
      sel.enviar.push(paraGrupo(v));
      if (!enviadas[v.id]) sel.novas.add(v.id);
    } else if (s === 'grande_demais') sel.grandes.push(v.id);
    else if (s === 'recusada') sel.recusadas.push(v.id);
  }
  return sel;
}

/** Quantas visitas ainda faltam ir para o grupo. */
export function faltamParaGrupo(
  visitas: Visita[],
  enviadas: EnviadasAoGrupo,
  recusadas: RecusadasPeloGrupo = {},
): number {
  return visitasParaEnviar(visitas, enviadas, recusadas).enviar.length;
}

export interface ResumoDoGrupo {
  /** Visitas (e exclusões) que ainda vão para o grupo. */
  faltam: number;
  /** Visitas que ficaram de fora: grandes demais ou recusadas pelo servidor. */
  naoForam: number;
}

export function resumoDoGrupo(
  visitas: Visita[],
  enviadas: EnviadasAoGrupo,
  recusadas: RecusadasPeloGrupo = {},
): ResumoDoGrupo {
  const sel = visitasParaEnviar(visitas, enviadas, recusadas);
  return { faltam: sel.enviar.length, naoForam: sel.grandes.length + sel.recusadas.length };
}

/**
 * Quantas visitas que já estão no celular vão para o grupo `codigo` logo ao
 * entrar nele (para o produtor saber antes de aceitar). Exclusões não contam.
 */
export function visitasQueVaoAoEntrar(
  visitas: Visita[],
  codigo: string,
  aceitas: { de: string | null; enviadas: EnviadasAoGrupo },
): number {
  const enviadas = aceitas.de === codigo ? aceitas.enviadas : {};
  return visitasParaEnviar(visitas, enviadas).enviar.filter((r) => r.apagado_em === null).length;
}

/** Texto da confirmação antes de entrar no grupo. */
export function avisoAoEntrar(i: { nome: string; existentes: number; atual: Grupo | null; codigo: string }): string {
  const quem = 'Quem coordena o grupo vai ver o que foi preenchido, inclusive o nome do produtor visitado.';
  const vao =
    i.existentes === 0
      ? `As visitas que você fizer serão enviadas para a coordenação de ${i.nome}.`
      : i.existentes === 1
        ? `A visita que já está neste celular e as que você fizer daqui para a frente vão para a coordenação de ${i.nome}.`
        : `As ${i.existentes} visitas que já estão neste celular e as que você fizer daqui para a frente vão para a coordenação de ${i.nome}.`;
  const troca =
    i.atual && i.atual.codigo !== i.codigo
      ? ` As visitas deixam de ir para ${i.atual.nome} e passam a ir para ${i.nome}.`
      : '';
  return `${vao} ${quem}${troca}`;
}
