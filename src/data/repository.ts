// Camada de repositório: regras de gravação comuns a todos os registros e a
// fila de alterações ainda não enviadas. Funções puras; o estado do app
// (src/store) só as chama. Uma sincronização online vai ler `Change[]` desta
// fila, enviar e, ao confirmar, chamar `acknowledge`.

import type { SyncMeta } from '@/lib/types';

/**
 * Tipos de registro sincronizados. São os mesmos nomes usados no servidor
 * (coluna `tipo`). perfil, culturas e visita são registros únicos por caderno.
 */
export type EntityKind = 'perfil' | 'culturas' | 'visita' | 'area' | 'anotacao' | 'pagina';

/** Id fixo dos registros únicos. */
export const SINGLETON_IDS = { perfil: 'perfil', culturas: 'culturas', visita: 'visita' } as const;

/** Um item da fila de alterações. Só a alteração mais recente de cada registro fica. */
export interface Change {
  id: string;
  entity: EntityKind;
  recordId: string;
  op: 'upsert' | 'delete';
  /** ISO 8601 */
  at: string;
}

/** Registros que não foram apagados. */
export function live<T extends SyncMeta>(list: T[]): T[] {
  return list.filter((r) => !r.deletedAt);
}

export function findLive<T extends SyncMeta>(list: T[], id: string): T | undefined {
  return list.find((r) => r.id === id && !r.deletedAt);
}

/** Cria ou atualiza um registro, marcando a hora da alteração. */
export function upsert<T extends SyncMeta>(list: T[], record: T, now: string): T[] {
  const next = { ...record, updatedAt: now };
  const i = list.findIndex((r) => r.id === record.id);
  if (i < 0) return [...list, next];
  const copy = list.slice();
  copy[i] = next;
  return copy;
}

/** Aplica uma mudança parcial a vários registros (ex.: marcar como passados a limpo). */
export function patchMany<T extends SyncMeta>(list: T[], ids: Set<string>, patch: Partial<T>, now: string): T[] {
  return list.map((r) => (ids.has(r.id) ? { ...r, ...patch, updatedAt: now } : r));
}

/** Apaga sem remover: marca `deletedAt`. */
export function softDelete<T extends SyncMeta>(list: T[], id: string, now: string): T[] {
  return list.map((r) => (r.id === id && !r.deletedAt ? { ...r, deletedAt: now, updatedAt: now } : r));
}

/** Desfaz um apagamento. */
export function undelete<T extends SyncMeta>(list: T[], id: string, now: string): T[] {
  return list.map((r) => {
    if (r.id !== id || !r.deletedAt) return r;
    const { deletedAt: _deletedAt, ...rest } = r;
    return { ...(rest as unknown as T), updatedAt: now };
  });
}

/**
 * Junta uma alteração na fila. Se o mesmo registro já estava na fila, a entrada
 * antiga sai: a sincronização só precisa do estado mais recente.
 */
export function enqueue(queue: Change[], change: Omit<Change, 'id'>, newId: () => string): Change[] {
  return [
    ...queue.filter((c) => !(c.entity === change.entity && c.recordId === change.recordId)),
    { ...change, id: newId() },
  ];
}

/** Tira da fila as alterações confirmadas pelo servidor. */
export function acknowledge(queue: Change[], ids: string[]): Change[] {
  const done = new Set(ids);
  return queue.filter((c) => !done.has(c.id));
}
