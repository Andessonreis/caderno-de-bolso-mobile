import type { Change } from '@/data/repository';

import { isUuid, uuid } from './ids';
import { toRelativeMediaPath } from './media';

/** Versão atual dos dados salvos no aparelho. */
export const STORAGE_VERSION = 5;

export interface MigrationDeps {
  newId: () => string;
  /** ISO 8601 */
  now: string;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Versão 1 → 2: fotos passam a guardar só o caminho relativo.
 * - anotação: `photoUri` (endereço completo) vira `photo` ("anotacoes/arquivo.jpg")
 * - foto do caderno: `uri` vira `file` ("caderno/arquivo.jpg"); a que não der para
 *   reconhecer é descartada
 */
function v1ToV2(state: Record<string, unknown>): Record<string, unknown> {
  const entries = Array.isArray(state.entries)
    ? state.entries.map((e) => {
        if (!isObj(e)) return e;
        const { photoUri, ...rest } = e;
        const photo = toRelativeMediaPath(typeof photoUri === 'string' ? photoUri : undefined);
        return photo ? { ...rest, photo } : rest;
      })
    : state.entries;
  const photos = Array.isArray(state.photos)
    ? state.photos.flatMap((p) => {
        if (!isObj(p)) return [];
        const { uri, ...rest } = p;
        const file = toRelativeMediaPath(typeof uri === 'string' ? uri : undefined);
        return file ? [{ ...rest, file }] : [];
      })
    : state.photos;
  return { ...state, entries, photos };
}

export interface RecordsToNormalize {
  areas: unknown[];
  entries: unknown[];
  photos: unknown[];
  lastAreaId?: unknown;
}

/**
 * Garante que todo registro tenha id UUID e `updatedAt`. Ids antigos são
 * trocados por UUID e as referências (área da anotação, última área usada)
 * acompanham a troca.
 */
export function normalizeRecords<T extends RecordsToNormalize>(data: T, deps: MigrationDeps): T {
  const areaIds = new Map<string, string>();
  const fixId = (id: unknown, map?: Map<string, string>): string => {
    if (isUuid(id)) return id;
    const next = deps.newId();
    if (map && typeof id === 'string') map.set(id, next);
    return next;
  };
  const areas = data.areas.map((a) =>
    isObj(a) ? { ...a, id: fixId(a.id, areaIds), updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : deps.now } : a,
  );
  const entries = data.entries.map((e) => {
    if (!isObj(e)) return e;
    const areaId = typeof e.areaId === 'string' ? (areaIds.get(e.areaId) ?? e.areaId) : e.areaId;
    const updatedAt =
      typeof e.updatedAt === 'string' ? e.updatedAt : typeof e.createdAt === 'string' ? e.createdAt : deps.now;
    return { ...e, id: fixId(e.id), areaId, updatedAt };
  });
  const photos = data.photos.map((p) =>
    isObj(p) ? { ...p, id: fixId(p.id), updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : deps.now } : p,
  );
  const lastAreaId =
    typeof data.lastAreaId === 'string' ? (areaIds.get(data.lastAreaId) ?? data.lastAreaId) : data.lastAreaId;
  return { ...data, areas, entries, photos, lastAreaId };
}

/**
 * Coloca na fila de alterações tudo o que é do produtor (dados de exemplo
 * nunca vão para a fila), para que a primeira sincronização envie tudo.
 */
export function initialChanges(state: Record<string, unknown>, deps: MigrationDeps): Change[] {
  const changes: Change[] = [];
  const add = (entity: Change['entity'], recordId: string, deleted: boolean) =>
    changes.push({ id: deps.newId(), entity, recordId, op: deleted ? 'delete' : 'upsert', at: deps.now });
  const profile = state.profile;
  if (isObj(profile) && !profile.exemplo) {
    add('perfil', 'perfil', false);
    add('culturas', 'culturas', false);
    add('visita', 'visita', false);
  }
  const lists: [Change['entity'], unknown][] = [
    ['area', state.areas],
    ['anotacao', state.entries],
    ['pagina', state.photos],
    ['visita_par', state.peerVisits],
  ];
  for (const [entity, list] of lists) {
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      if (isObj(r) && typeof r.id === 'string' && !r.exemplo) add(entity, r.id, Boolean(r.deletedAt));
    }
  }
  return changes;
}

/** Versão 2 → 3: ids UUID, `updatedAt` em todo registro e fila de alterações. */
function v2ToV3(state: Record<string, unknown>, deps: MigrationDeps): Record<string, unknown> {
  const normalized = normalizeRecords(
    {
      ...state,
      areas: Array.isArray(state.areas) ? state.areas : [],
      entries: Array.isArray(state.entries) ? state.entries : [],
      photos: Array.isArray(state.photos) ? state.photos : [],
    },
    deps,
  );
  return { ...normalized, pendingChanges: initialChanges(normalized, deps) };
}

const OLD_ENTITY: Record<string, Change['entity'][]> = {
  profile: ['perfil'],
  settings: ['culturas', 'visita'],
  area: ['area'],
  entry: ['anotacao'],
  photo: ['pagina'],
  // nomes atuais (fila criada pela própria migração 2 → 3) ficam como estão
  perfil: ['perfil'],
  culturas: ['culturas'],
  visita: ['visita'],
  anotacao: ['anotacao'],
  pagina: ['pagina'],
};

/**
 * Versão 3 → 4: a fila passa a usar os nomes de tipo do servidor, as listas
 * únicas (culturas e itens da visita) ganham data de alteração e entra a
 * configuração da cópia na internet (desligada até o produtor aceitar).
 */
function v3ToV4(state: Record<string, unknown>, deps: MigrationDeps): Record<string, unknown> {
  const queue = Array.isArray(state.pendingChanges) ? state.pendingChanges : [];
  const pendingChanges: Change[] = [];
  for (const c of queue) {
    if (!isObj(c) || typeof c.entity !== 'string' || typeof c.recordId !== 'string') continue;
    for (const entity of OLD_ENTITY[c.entity] ?? []) {
      const recordId = entity === 'perfil' || entity === 'culturas' || entity === 'visita' ? entity : c.recordId;
      pendingChanges.push({
        id: deps.newId(),
        entity,
        recordId,
        op: c.op === 'delete' ? 'delete' : 'upsert',
        at: typeof c.at === 'string' ? c.at : deps.now,
      });
    }
  }
  const latest = new Map(pendingChanges.map((c) => [`${c.entity}:${c.recordId}`, c]));
  return {
    ...state,
    pendingChanges: [...latest.values()],
    culturasUpdatedAt: deps.now,
    visitaUpdatedAt: deps.now,
    sync: { ligado: false, perguntado: false, cursor: 0, enviados: {} },
  };
}

/**
 * Versão 4 → 5: entram as visitas feitas à roça de outros produtores (roteiro
 * de visita). O cursor da cópia na internet volta a zero: a versão anterior
 * pulava as visitas que outro celular já tinha enviado, mas andava o cursor, e
 * elas nunca mais viriam. Receber tudo de novo não estraga nada (vence sempre a
 * alteração mais recente).
 */
function v4ToV5(state: Record<string, unknown>): Record<string, unknown> {
  const peerVisits = Array.isArray(state.peerVisits) ? state.peerVisits : [];
  if (!isObj(state.sync)) return { ...state, peerVisits };
  return { ...state, peerVisits, sync: { ...state.sync, cursor: 0 } };
}

/** Atualiza dados salvos por versões anteriores do app. */
export function migratePersisted(
  persisted: unknown,
  fromVersion: number,
  deps: MigrationDeps = { newId: uuid, now: new Date().toISOString() },
): unknown {
  if (!isObj(persisted)) return persisted;
  let state = persisted;
  if (fromVersion < 2) state = v1ToV2(state);
  if (fromVersion < 3) state = v2ToV3(state, deps);
  if (fromVersion < 4) state = v3ToV4(state, deps);
  if (fromVersion < 5) state = v4ToV5(state);
  return state;
}
