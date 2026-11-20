/**
 * Modelo do roteiro de apoio à visita de pares: quando o produtor vai visitar
 * a roça de outro produtor do grupo.
 *
 * É o mesmo roteiro do site (as mesmas etapas, perguntas e regras), para os
 * dois fazerem as mesmas perguntas. As perguntas são dados (o array ITENS), não
 * telas repetidas: a tela, o resumo, o PDF e o cálculo de progresso leem todos
 * daqui. Funções puras, sem dependência de tela.
 *
 * Diferença em relação ao site: a visita é um registro do caderno como os
 * outros (id estável, `updatedAt` e `deletedAt`), para entrar na cópia de
 * segurança e na cópia na internet.
 */

import { parseISODate } from './dates';
import { uuid } from './ids';
import type { SyncMeta } from './types';

export type Resposta = 'sim' | 'parte' | 'nao' | 'na';

export const OPCOES_RESPOSTA: readonly { valor: Resposta; rotulo: string }[] = [
  { valor: 'sim', rotulo: 'Sim' },
  { valor: 'parte', rotulo: 'Em parte' },
  { valor: 'nao', rotulo: 'Não' },
  { valor: 'na', rotulo: 'Não se aplica' },
];

export const ROTULO_RESPOSTA: Record<Resposta, string> = {
  sim: 'Sim',
  parte: 'Em parte',
  nao: 'Não',
  na: 'Não se aplica',
};

export type EtapaId = 'identificacao' | 'documentos' | 'sementes' | 'insumos' | 'colheita' | 'controle' | 'fechamento';

export type Etapa = { id: EtapaId; titulo: string; resumo: string };

export const ETAPAS: readonly Etapa[] = [
  { id: 'identificacao', titulo: 'Quem e quando', resumo: 'Produtor visitado, data e quem visita.' },
  { id: 'documentos', titulo: 'Documentos', resumo: 'Caderno de campo, notas, DTCs e plano de manejo.' },
  { id: 'sementes', titulo: 'Sementes e mudas', resumo: 'De onde vem o que foi plantado.' },
  { id: 'insumos', titulo: 'Insumos e manejo', resumo: 'O que vai na terra e nas plantas.' },
  { id: 'colheita', titulo: 'Colheita, armazenamento e transporte', resumo: 'Como o produto é guardado e levado.' },
  { id: 'controle', titulo: 'Controle', resumo: 'Anotações de custos, colheita e venda.' },
  { id: 'fechamento', titulo: 'Fechamento', resumo: 'O que precisa corrigir e o parecer do grupo.' },
];

/** Culturas que pedem comprovação da origem do material plantado. */
export const CULTURAS_SENSIVEIS = ['algodão', 'feijão', 'milho', 'soja'] as const;
export type CulturaSensivel = (typeof CULTURAS_SENSIVEIS)[number];

export type UsoArmazenamento = 'exclusivo' | 'compartilhado';

export type Parecer = 'conforme' | 'pendencias' | 'nao_conforme';

export const OPCOES_PARECER: readonly { valor: Parecer; rotulo: string; ajuda: string }[] = [
  { valor: 'conforme', rotulo: 'Conforme', ajuda: 'Está tudo de acordo.' },
  {
    valor: 'pendencias',
    rotulo: 'Conforme com pendências',
    ajuda: 'Está de acordo, mas tem coisas para corrigir no prazo.',
  },
  { valor: 'nao_conforme', rotulo: 'Não conforme', ajuda: 'Tem problema que impede a conformidade.' },
];

export type TipoVisita = 'pares' | 'externo';

export const OPCOES_TIPO: readonly { valor: TipoVisita; rotulo: string; ajuda: string }[] = [
  { valor: 'pares', rotulo: 'Visita de pares', ajuda: 'Feita por agricultores do grupo.' },
  { valor: 'externo', rotulo: 'Olhar externo', ajuda: 'Com alguém de fora do grupo.' },
];

export type NaoConformidade = { id: string; descricao: string; prazo: string };

export type RespostaItem = { r?: Resposta; obs: string };

export interface Visita extends SyncMeta {
  /** ISO 8601 */
  criadaEm: string;
  produtor: { nome: string; municipio: string; culturas: string[] };
  /** AAAA-MM-DD */
  data: string;
  visitantes: string;
  tipo: TipoVisita | '';
  culturasSensiveis: CulturaSensivel[];
  usoArmazenamento: UsoArmazenamento | '';
  separacao: string;
  respostas: Record<string, RespostaItem>;
  naoConformidades: NaoConformidade[];
  pontosFortes: string;
  observacoes: string;
  parecer: Parecer | '';
}

export type Item = {
  id: string;
  etapa: EtapaId;
  texto: string;
  ajuda?: string;
  /** Quando existe, o item só aparece se a função devolver true. */
  mostrarSe?: (visita: Visita) => boolean;
};

export const ITENS: readonly Item[] = [
  // Documentos
  { id: 'doc_caderno', etapa: 'documentos', texto: 'O caderno de campo foi apresentado?' },
  {
    id: 'doc_caderno_em_dia',
    etapa: 'documentos',
    texto: 'O caderno de campo está em dia?',
    ajuda: 'Plantios, tratos, colheitas e vendas anotados até a semana da visita.',
  },
  { id: 'doc_notas', etapa: 'documentos', texto: 'As notas fiscais e recibos de compra e venda estão guardados?' },
  {
    id: 'doc_dtc',
    etapa: 'documentos',
    texto: 'As DTCs entregues aos compradores estão guardadas?',
    ajuda: 'Cópia ou registro de cada declaração entregue.',
  },
  { id: 'doc_plano', etapa: 'documentos', texto: 'O plano de manejo está atualizado?' },
  { id: 'doc_plano_bate', etapa: 'documentos', texto: 'O plano de manejo bate com o que foi visto na roça?' },
  // Sementes e mudas
  {
    id: 'sem_origem',
    etapa: 'sementes',
    texto: 'A origem das sementes e mudas está anotada?',
    ajuda: 'Semente própria, troca, casa de sementes ou compra.',
  },
  {
    id: 'sem_comprovacao',
    etapa: 'sementes',
    texto: 'Há comprovação de origem do material plantado dessas culturas?',
    ajuda: 'Declaração de que não é transgênico, nota de compra ou registro da troca.',
    mostrarSe: (v) => v.culturasSensiveis.length > 0,
  },
  // Insumos e manejo
  { id: 'ins_permitidos', etapa: 'insumos', texto: 'Os insumos usados são permitidos na produção orgânica?' },
  {
    id: 'ins_origem',
    etapa: 'insumos',
    texto: 'A origem dos insumos está registrada?',
    ajuda: 'De onde veio o esterco, o composto, o pó de rocha e os demais.',
  },
  { id: 'ins_anotados', etapa: 'insumos', texto: 'As caldas e adubos aplicados estão anotados no caderno?' },
  {
    id: 'ins_barreiras',
    etapa: 'insumos',
    texto: 'Há proteção contra contaminação vinda do vizinho?',
    ajuda: 'Barreira de plantas, distância ou outro cuidado onde há risco.',
  },
  // Colheita, armazenamento e transporte
  { id: 'col_registrada', etapa: 'colheita', texto: 'A colheita está anotada no caderno?' },
  {
    id: 'col_separacao_ok',
    etapa: 'colheita',
    texto: 'A separação do produto orgânico está sendo feita e anotada?',
    mostrarSe: (v) => v.usoArmazenamento === 'compartilhado',
  },
  { id: 'col_embalagem', etapa: 'colheita', texto: 'As embalagens e sacarias estão limpas e identificadas?' },
  // Controle
  { id: 'ctl_custos', etapa: 'controle', texto: 'A família anota custos e produção?' },
  {
    id: 'ctl_coerencia',
    etapa: 'controle',
    texto: 'As quantidades colhidas e vendidas fazem sentido entre si?',
    ajuda: 'Não se vende mais do que se colheu.',
  },
];

/** Itens visíveis numa etapa, considerando as condições. */
export function itensDaEtapa(visita: Visita, etapa: EtapaId): Item[] {
  return ITENS.filter((i) => i.etapa === etapa && (!i.mostrarSe || i.mostrarSe(visita)));
}

/** Todos os itens visíveis, na ordem das etapas. */
export function itensVisiveis(visita: Visita): Item[] {
  return ETAPAS.flatMap((e) => itensDaEtapa(visita, e.id));
}

export type Pendencia = { etapa: EtapaId; rotulo: string };

/**
 * O que ainda falta responder. Conta os itens do roteiro e os campos que não
 * são opcionais: nome do produtor, data, tipo de visita, uso do armazém (e
 * como é feita a separação, se compartilhado) e o parecer.
 */
export function pendencias(visita: Visita): Pendencia[] {
  const lista: Pendencia[] = [];
  if (!visita.produtor.nome.trim()) lista.push({ etapa: 'identificacao', rotulo: 'Nome do produtor' });
  if (!visita.data) lista.push({ etapa: 'identificacao', rotulo: 'Data da visita' });
  if (!visita.tipo) lista.push({ etapa: 'identificacao', rotulo: 'Tipo de visita' });

  for (const etapa of ETAPAS) {
    if (etapa.id === 'colheita') {
      if (!visita.usoArmazenamento) {
        lista.push({ etapa: 'colheita', rotulo: 'Armazém e transporte: exclusivo ou compartilhado' });
      } else if (visita.usoArmazenamento === 'compartilhado' && !visita.separacao.trim()) {
        lista.push({ etapa: 'colheita', rotulo: 'Como é feita e registrada a separação' });
      }
    }
    for (const item of itensDaEtapa(visita, etapa.id)) {
      if (!visita.respostas[item.id]?.r) lista.push({ etapa: etapa.id, rotulo: item.texto });
    }
  }

  if (!visita.parecer) lista.push({ etapa: 'fechamento', rotulo: 'Parecer' });
  return lista;
}

/** Quantidade de perguntas obrigatórias na visita do jeito que está. */
export function totalDePerguntas(visita: Visita): number {
  const fixos = 3 /* nome, data, tipo */ + 1 /* uso do armazém */ + 1; /* parecer */
  const separacao = visita.usoArmazenamento === 'compartilhado' ? 1 : 0;
  return fixos + separacao + itensVisiveis(visita).length;
}

export function progresso(visita: Visita): { feitos: number; total: number; fracao: number } {
  const total = totalDePerguntas(visita);
  const feitos = total - pendencias(visita).length;
  return { feitos, total, fracao: total ? feitos / total : 0 };
}

/** Identificador curto e único o bastante para os itens de uma visita. */
export function novoId(agora: number = Date.now(), aleatorio: number = Math.random()): string {
  return `${agora.toString(36)}-${Math.floor(aleatorio * 1e9).toString(36)}`;
}

/** Data local de hoje em AAAA-MM-DD. */
export function hojeIso(agora: Date = new Date()): string {
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${m}-${d}`;
}

export function novaVisita(agora: Date = new Date(), id: string = uuid()): Visita {
  const iso = agora.toISOString();
  return {
    id,
    criadaEm: iso,
    updatedAt: iso,
    produtor: { nome: '', municipio: '', culturas: [] },
    data: hojeIso(agora),
    visitantes: '',
    tipo: '',
    culturasSensiveis: [],
    usoArmazenamento: '',
    separacao: '',
    respostas: {},
    naoConformidades: [],
    pontosFortes: '',
    observacoes: '',
    parecer: '',
  };
}

/**
 * Visita aberta e deixada sem nada: sem nome, sem resposta, sem escolha e sem
 * texto. A data não conta, porque já vem preenchida com o dia de hoje.
 */
export function visitaVazia(v: Visita): boolean {
  const textos = [
    v.produtor.nome,
    v.produtor.municipio,
    ...v.produtor.culturas,
    v.visitantes,
    v.separacao,
    v.pontosFortes,
    v.observacoes,
  ];
  return (
    textos.every((t) => !t.trim()) &&
    !v.tipo &&
    !v.usoArmazenamento &&
    !v.parecer &&
    v.culturasSensiveis.length === 0 &&
    v.naoConformidades.length === 0 &&
    Object.values(v.respostas).every((r) => !r.r && !r.obs.trim())
  );
}

const SEM_ACENTO: Record<string, string> = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ç: 'c',
};

/**
 * Sem acento e em minúsculas, para comparar nomes de cultura. Igual ao site:
 * separa letra e acento (NFD) e tira o acento, o que também resolve texto
 * colado com o acento já separado. A tabela só vale onde não houver normalize.
 */
function simplificar(texto: string): string {
  if (typeof texto.normalize === 'function') {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }
  return texto.toLowerCase().replace(/[áàâãäéèêëíìîïóòôõöúùûüç]/g, (c) => SEM_ACENTO[c] ?? c);
}

/** Marca automaticamente as culturas sensíveis citadas na lista do produtor. */
export function culturasSensiveisDe(culturas: string[]): CulturaSensivel[] {
  const nomes = culturas.map(simplificar);
  return CULTURAS_SENSIVEIS.filter((c) => nomes.some((n) => n.includes(simplificar(c))));
}

// ---------------------------------------------------------------------------
// Limites e leitura de visitas vindas de fora (cópia de segurança, internet)

/**
 * Limites de cada campo, em letras. Os campos da tela usam os mesmos números no
 * maxLength, para nada ser cortado sem a pessoa ver. São menores que os do
 * site para a visita inteira caber num registro da cópia na internet (32 KB).
 */
export const LIMITES_VISITA = {
  nome: 80,
  municipio: 60,
  visitantes: 120,
  cultura: 40,
  culturas: 12,
  observacao: 300,
  textoLongo: 600,
  naoConformidade: 300,
  naoConformidades: 15,
} as const;

/**
 * Cada campo também tem um teto em bytes: o dobro do limite em letras. Letra
 * sem acento ocupa 1 byte e com acento 2, então texto em português nunca chega
 * nele; quem chega é texto cheio de emoji ou de "…" (3 a 4 bytes cada). Com
 * esse teto, a maior visita possível fica abaixo de 30.000 bytes.
 */
const BYTES_POR_LETRA = 2;

/** Bytes de um texto em UTF-8 (o que o servidor conta). Caractere solto, sem par, conta como 3. */
export function bytesUtf8(texto: string): number {
  let total = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c < 0x80) total += 1;
    else if (c < 0x800) total += 2;
    else if (c >= 0xd800 && c <= 0xdbff && (texto.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      total += 4;
      i += 1;
    } else total += 3;
  }
  return total;
}

/** Bytes que o texto ocupa dentro do registro (JSON: aspas e quebras de linha viram dois caracteres). */
function bytesNoRegistro(texto: string): number {
  return bytesUtf8(JSON.stringify(texto)) - 2;
}

/**
 * Corta o texto no limite de letras e no teto de bytes, sem partir emoji nem
 * acento. Não mexe em espaços: serve para o que está sendo digitado.
 */
export function cortarNoLimite(texto: string, limite: number, bytes: number = limite * BYTES_POR_LETRA): string {
  let saida = '';
  let letras = 0;
  let total = 0;
  for (const c of texto) {
    const b = bytesNoRegistro(c);
    if (letras >= limite || total + b > bytes) break;
    saida += c;
    letras += 1;
    total += b;
  }
  return saida;
}

/**
 * Quantas letras ainda cabem no campo: o menor entre o que falta no maxLength
 * da tela e o que falta no teto de bytes (contando 2 bytes por letra).
 */
export function letrasRestantes(texto: string, limite: number): number {
  const porBytes = Math.floor((limite * BYTES_POR_LETRA - bytesNoRegistro(texto)) / BYTES_POR_LETRA);
  return Math.max(0, Math.min(limite - texto.length, porBytes));
}

const CARACTERES_INVISIVEIS = new RegExp(
  '[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\u2066-\\u2069]',
  'g',
);

/** Texto de uma linha: sem caracteres invisíveis, espaços juntados, cortado no limite. */
export function limparTexto(valor: unknown, limite: number, bytes?: number): string {
  if (typeof valor !== 'string') return '';
  const limpo = valor.replace(CARACTERES_INVISIVEIS, ' ').replace(/\s+/g, ' ').trim();
  return cortarNoLimite(limpo, limite, bytes).trim();
}

/** Texto longo: mantém quebras de linha, tira só caracteres de controle. */
function textoLongo(valor: unknown, limite: number): string {
  if (typeof valor !== 'string') return '';
  const limpo = valor
    .replace(/\r\n?/g, '\n')
    .split('')
    .filter((c) => c === '\n' || c.charCodeAt(0) >= 32)
    .join('')
    .trim();
  return cortarNoLimite(limpo, limite);
}

function umDe<T extends string>(valor: unknown, opcoes: readonly T[]): T | '' {
  return typeof valor === 'string' && (opcoes as readonly string[]).includes(valor) ? (valor as T) : '';
}

function dataValida(valor: unknown): valor is string {
  return typeof valor === 'string' && parseISODate(valor) !== null;
}

function instanteValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length <= 40 && !Number.isNaN(Date.parse(valor));
}

const RESPOSTAS: readonly Resposta[] = ['sim', 'parte', 'nao', 'na'];
const IDS_ITENS = new Set(ITENS.map((i) => i.id));

/**
 * Lê uma visita de qualquer objeto (arquivo de cópia, registro da internet).
 * Valores fora do esperado são limpos. Devolve null se não houver id.
 */
export function normalizarVisita(entrada: unknown, agora: string = new Date(0).toISOString()): Visita | null {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return null;
  const o = entrada as Record<string, unknown>;
  const id = limparTexto(o.id, 60, 60);
  if (!id) return null;

  const produtorCru =
    typeof o.produtor === 'object' && o.produtor !== null ? (o.produtor as Record<string, unknown>) : {};
  const culturas = Array.isArray(produtorCru.culturas)
    ? produtorCru.culturas
        .map((c) => limparTexto(c, LIMITES_VISITA.cultura))
        .filter(Boolean)
        .slice(0, LIMITES_VISITA.culturas)
    : [];

  const respostas: Record<string, RespostaItem> = {};
  if (typeof o.respostas === 'object' && o.respostas !== null) {
    for (const [chave, valor] of Object.entries(o.respostas as Record<string, unknown>)) {
      if (!IDS_ITENS.has(chave) || typeof valor !== 'object' || valor === null) continue;
      const v = valor as Record<string, unknown>;
      const r = umDe(v.r, RESPOSTAS);
      const obs = textoLongo(v.obs, LIMITES_VISITA.observacao);
      if (r || obs) respostas[chave] = r ? { r, obs } : { obs };
    }
  }

  const naoConformidades: NaoConformidade[] = Array.isArray(o.naoConformidades)
    ? o.naoConformidades
        .filter((n): n is Record<string, unknown> => typeof n === 'object' && n !== null)
        .slice(0, LIMITES_VISITA.naoConformidades)
        .map((n) => ({
          id: limparTexto(n.id, 60, 60) || novoId(),
          descricao: textoLongo(n.descricao, LIMITES_VISITA.naoConformidade),
          prazo: dataValida(n.prazo) ? n.prazo : '',
        }))
    : [];

  const culturasSensiveis = Array.isArray(o.culturasSensiveis)
    ? CULTURAS_SENSIVEIS.filter((c) => (o.culturasSensiveis as unknown[]).includes(c))
    : [];

  const updatedAt = instanteValido(o.updatedAt) ? o.updatedAt : agora;
  return {
    id,
    criadaEm: instanteValido(o.criadaEm) ? o.criadaEm : updatedAt,
    updatedAt,
    ...(instanteValido(o.deletedAt) ? { deletedAt: o.deletedAt } : {}),
    produtor: {
      nome: limparTexto(produtorCru.nome, LIMITES_VISITA.nome),
      municipio: limparTexto(produtorCru.municipio, LIMITES_VISITA.municipio),
      culturas,
    },
    data: dataValida(o.data) ? o.data : '',
    visitantes: limparTexto(o.visitantes, LIMITES_VISITA.visitantes),
    tipo: umDe<TipoVisita>(o.tipo, ['pares', 'externo']),
    culturasSensiveis,
    usoArmazenamento: umDe<UsoArmazenamento>(o.usoArmazenamento, ['exclusivo', 'compartilhado']),
    separacao: textoLongo(o.separacao, LIMITES_VISITA.textoLongo),
    respostas,
    naoConformidades,
    pontosFortes: textoLongo(o.pontosFortes, LIMITES_VISITA.textoLongo),
    observacoes: textoLongo(o.observacoes, LIMITES_VISITA.textoLongo),
    parecer: umDe<Parecer>(o.parecer, ['conforme', 'pendencias', 'nao_conforme']),
  };
}

/** Nome do produtor para mostrar, com um texto no lugar quando ainda não foi preenchido. */
export function nomeDoProdutor(visita: Visita): string {
  return visita.produtor.nome.trim() || 'Produtor sem nome';
}

/** Nome do arquivo do PDF: visita-ze-carlos-2026-11-20 */
export function nomeDoArquivo(visita: Visita): string {
  const nome =
    simplificar(visita.produtor.nome)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'sem-nome';
  return `visita-${nome}-${visita.data || 'sem-data'}`;
}
