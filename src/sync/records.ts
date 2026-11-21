// Tradução entre os dados do aparelho e os registros do servidor
// ({ tipo, id, dados, atualizado_em, apagado_em }). Funções puras.

import { type Change, type EntityKind, SINGLETON_IDS } from '@/data/repository';
import { isArea, isEntry, isNotebookPhoto, isProfile } from '@/lib/backup';
import { MANUAL_CHECKS } from '@/lib/catalog';
import { parseISODate } from '@/lib/dates';
import { type Visita, bytesUtf8, normalizarVisita } from '@/lib/roteiro';
import type { Area, Entry, ISODate, ManualCheckId, NotebookPhoto, Profile } from '@/lib/types';

/** Registro como o servidor recebe. */
export interface OutgoingRecord {
  tipo: EntityKind;
  id: string;
  dados: Record<string, unknown>;
  atualizado_em: string;
  apagado_em: string | null;
}

/** Registro como o servidor devolve. */
export interface RemoteRecord {
  tipo: string;
  id: string;
  dados: unknown;
  atualizado_em: string;
  apagado_em: string | null;
  seq: number;
}

/** Parte do estado do app que a sincronização lê e escreve. */
export interface SyncedState {
  profile: Profile | null;
  areas: Area[];
  crops: string[];
  entries: Entry[];
  photos: NotebookPhoto[];
  peerVisits: Visita[];
  manualChecks: Partial<Record<ManualCheckId, boolean>>;
  lastVisitDate?: ISODate;
  culturasUpdatedAt?: string;
  visitaUpdatedAt?: string;
  pendingChanges: Change[];
}

/** Limite do servidor por registro é 32.768 bytes; deixamos folga. */
export const MAX_RECORD_BYTES = 30_000;
/** Limite do servidor por chamada. */
export const MAX_BATCH = 200;

function without<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const copy = { ...obj };
  for (const k of keys) delete copy[k];
  return copy;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Monta o registro de uma alteração da fila. Retorna null se o registro não
 * existir mais ou for de exemplo (a alteração sai da fila sem ir ao servidor).
 */
export function toOutgoing(change: Change, st: SyncedState): OutgoingRecord | null {
  const base = (updatedAt: string, deletedAt?: string) => ({
    tipo: change.entity,
    id: change.recordId,
    atualizado_em: updatedAt,
    apagado_em: deletedAt ?? null,
  });
  switch (change.entity) {
    case 'perfil': {
      const p = st.profile;
      if (!p || p.exemplo || !p.updatedAt) return null;
      return { ...base(p.updatedAt), dados: without(p, ['exemplo', 'updatedAt']) };
    }
    case 'culturas':
      if (!st.culturasUpdatedAt || st.profile?.exemplo) return null;
      return { ...base(st.culturasUpdatedAt), dados: { lista: st.crops } };
    case 'visita':
      if (!st.visitaUpdatedAt || st.profile?.exemplo) return null;
      return {
        ...base(st.visitaUpdatedAt),
        dados: { itens: st.manualChecks, ...(st.lastVisitDate ? { ultimaVisita: st.lastVisitDate } : {}) },
      };
    case 'area': {
      const a = st.areas.find((x) => x.id === change.recordId);
      if (!a || a.exemplo) return null;
      return { ...base(a.updatedAt, a.deletedAt), dados: { name: a.name } };
    }
    case 'anotacao': {
      const e = st.entries.find((x) => x.id === change.recordId);
      if (!e || e.exemplo) return null;
      return { ...base(e.updatedAt, e.deletedAt), dados: without(e, ['id', 'updatedAt', 'deletedAt', 'exemplo']) };
    }
    case 'pagina': {
      const p = st.photos.find((x) => x.id === change.recordId);
      if (!p) return null;
      return { ...base(p.updatedAt, p.deletedAt), dados: without(p, ['id', 'updatedAt', 'deletedAt']) };
    }
    case 'visita_par': {
      const v = st.peerVisits.find((x) => x.id === change.recordId);
      if (!v) return null;
      // Visita apagada sobe sem os dados: o que foi anotado sobre outro produtor não fica no servidor.
      return { ...base(v.updatedAt, v.deletedAt), dados: v.deletedAt ? {} : visitaDados(v) };
    }
  }
}

/** Dados de uma visita como vão para o servidor (sem os campos de controle). */
export function visitaDados(v: Visita): Record<string, unknown> {
  return without(v, ['id', 'updatedAt', 'deletedAt']);
}

/** Registro maior do que o servidor aceita (contado em bytes, como o servidor conta). */
export function recordTooBig(r: OutgoingRecord): boolean {
  return bytesUtf8(JSON.stringify(r)) > MAX_RECORD_BYTES;
}

/** A visita não cabe num registro da cópia na internet e fica só no celular. */
export function visitaGrandeDemais(v: Visita): boolean {
  if (v.deletedAt) return false;
  const dados = visitaDados(v);
  return recordTooBig({ tipo: 'visita_par', id: v.id, dados, atualizado_em: v.updatedAt, apagado_em: null });
}

export interface OutgoingBatch {
  records: OutgoingRecord[];
  /** Ids das alterações cobertas por este lote (saem da fila quando o servidor confirmar). */
  changeIds: string[];
  /** Alterações que não precisam ir (registro sumiu ou é de exemplo). */
  dropped: string[];
  /**
   * Alterações de registros maiores do que o servidor aceita. Ficam na fila,
   * fora do lote, sem travar o resto: vão quando o registro diminuir.
   */
  tooBig: string[];
}

/** Separa até `limit` alterações da fila em registros prontos para enviar. */
export function buildOutgoing(st: SyncedState, limit = MAX_BATCH): OutgoingBatch {
  const records: OutgoingRecord[] = [];
  const changeIds: string[] = [];
  const dropped: string[] = [];
  const tooBig: string[] = [];
  for (const c of st.pendingChanges) {
    if (records.length >= limit) break;
    const r = toOutgoing(c, st);
    if (!r) {
      dropped.push(c.id);
      continue;
    }
    if (recordTooBig(r)) {
      tooBig.push(c.id);
      continue;
    }
    records.push(r);
    changeIds.push(c.id);
  }
  return { records, changeIds, dropped, tooBig };
}

function newer(remote: string, local: string | undefined): boolean {
  if (!local) return true;
  const r = Date.parse(remote);
  const l = Date.parse(local);
  if (Number.isNaN(r)) return false;
  if (Number.isNaN(l)) return true;
  return r > l;
}

function meta(r: RemoteRecord) {
  return { id: r.id, updatedAt: r.atualizado_em, ...(r.apagado_em ? { deletedAt: r.apagado_em } : {}) };
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

export interface MergeResult {
  state: SyncedState;
  /** Registros do servidor aplicados aqui (mais novos que os do aparelho). */
  applied: number;
}

/**
 * Junta os registros do servidor ao estado do aparelho. Vence a alteração mais
 * recente (`atualizado_em` × `updatedAt`). Registros inválidos são ignorados,
 * e nada do aparelho é apagado só porque não veio do servidor.
 */
export function mergeRemote(st: SyncedState, remote: RemoteRecord[]): MergeResult {
  let next: SyncedState = { ...st };
  let applied = 0;
  const replaced = new Set<string>();

  for (const r of remote) {
    const d = isObj(r.dados) ? r.dados : {};
    const before = next;
    switch (r.tipo) {
      case 'perfil': {
        if (r.id !== SINGLETON_IDS.perfil || r.apagado_em) break;
        const local = next.profile;
        if (local && !local.exemplo && !newer(r.atualizado_em, local.updatedAt)) break;
        if (!isProfile(d)) break;
        next = { ...next, profile: { ...(d as unknown as Profile), updatedAt: r.atualizado_em } };
        break;
      }
      case 'culturas': {
        if (r.id !== SINGLETON_IDS.culturas || !newer(r.atualizado_em, next.culturasUpdatedAt)) break;
        if (!Array.isArray(d.lista) || !d.lista.every((x) => typeof x === 'string')) break;
        next = { ...next, crops: d.lista as string[], culturasUpdatedAt: r.atualizado_em };
        break;
      }
      case 'visita': {
        if (r.id !== SINGLETON_IDS.visita || !newer(r.atualizado_em, next.visitaUpdatedAt)) break;
        const itens: Partial<Record<ManualCheckId, boolean>> = {};
        if (isObj(d.itens)) for (const m of MANUAL_CHECKS) if (d.itens[m.id] === true) itens[m.id] = true;
        const ultima = typeof d.ultimaVisita === 'string' && parseISODate(d.ultimaVisita) ? d.ultimaVisita : undefined;
        next = { ...next, manualChecks: itens, lastVisitDate: ultima, visitaUpdatedAt: r.atualizado_em };
        break;
      }
      case 'area': {
        const local = next.areas.find((a) => a.id === r.id);
        if (local && !newer(r.atualizado_em, local.updatedAt)) break;
        const candidate = { ...d, ...meta(r) };
        if (!isArea(candidate)) break;
        next = { ...next, areas: upsertById(next.areas, candidate as Area) };
        break;
      }
      case 'anotacao': {
        const local = next.entries.find((e) => e.id === r.id);
        if (local && !newer(r.atualizado_em, local.updatedAt)) break;
        const candidate = { ...d, ...meta(r) };
        if (!isEntry(candidate)) break;
        next = { ...next, entries: upsertById(next.entries, candidate) };
        break;
      }
      case 'pagina': {
        const local = next.photos.find((p) => p.id === r.id);
        if (local && !newer(r.atualizado_em, local.updatedAt)) break;
        const candidate = { ...d, ...meta(r) };
        if (!isNotebookPhoto(candidate)) break;
        next = { ...next, photos: upsertById(next.photos, candidate) };
        break;
      }
      case 'visita_par': {
        const local = next.peerVisits.find((v) => v.id === r.id);
        if (local && !newer(r.atualizado_em, local.updatedAt)) break;
        const candidate = normalizarVisita({ ...d, id: r.id });
        if (!candidate || candidate.id !== r.id) break;
        const { deletedAt: _deletedAt, ...rest } = candidate;
        // Apagamento chega sem os dados: o que já estava aqui fica, só marcado como apagado.
        const dados = r.apagado_em && local ? without(local, ['deletedAt']) : rest;
        next = { ...next, peerVisits: upsertById(next.peerVisits, { ...dados, ...meta(r) }) };
        break;
      }
      default:
        continue;
    }
    if (next !== before) {
      replaced.add(`${r.tipo}:${r.id}`);
      applied += 1;
    }
  }

  // Uma alteração local que perdeu para a do servidor não precisa mais ser enviada.
  const pendingChanges = next.pendingChanges.filter((c) => !replaced.has(`${c.entity}:${c.recordId}`));
  return { state: { ...next, pendingChanges }, applied };
}
