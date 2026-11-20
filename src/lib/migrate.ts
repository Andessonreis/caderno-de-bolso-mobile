import { toRelativePhotoPath } from './photos';

/** Versão atual dos dados salvos no aparelho. */
export const STORAGE_VERSION = 2;

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
        const photo = toRelativePhotoPath(typeof photoUri === 'string' ? photoUri : undefined);
        return photo ? { ...rest, photo } : rest;
      })
    : state.entries;
  const photos = Array.isArray(state.photos)
    ? state.photos.flatMap((p) => {
        if (!isObj(p)) return [];
        const { uri, ...rest } = p;
        const file = toRelativePhotoPath(typeof uri === 'string' ? uri : undefined);
        return file ? [{ ...rest, file }] : [];
      })
    : state.photos;
  return { ...state, entries, photos };
}

/** Atualiza dados salvos por versões anteriores do app. */
export function migratePersisted(persisted: unknown, fromVersion: number): unknown {
  if (!isObj(persisted)) return persisted;
  let state = persisted;
  if (fromVersion < 2) state = v1ToV2(state);
  return state;
}
