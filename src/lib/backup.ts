import { DESTINATIONS, INPUTS, INPUT_ORIGINS, MANUAL_CHECKS, PURCHASE_KINDS, SEED_ORIGINS, isUnit } from './catalog';
import { parseISODate } from './dates';
import { uuid } from './ids';
import { isRelativeMediaPath, toRelativeMediaPath } from './media';
import { type MigrationDeps, normalizeRecords } from './migrate';
import type { ActivityKind, Area, Entry, ManualCheckId, NotebookPhoto, Profile } from './types';

/** Versão atual do arquivo de cópia de segurança. */
export const BACKUP_VERSION = 2;

/**
 * Dados do arquivo de cópia de segurança (`dados.json` dentro do .zip). As
 * fotos e os recados de voz vão como arquivos ao lado, em `midia/`.
 * A versão 1 (só JSON, sem mídia) continua sendo aceita na importação.
 */
export interface BackupData {
  app: 'caderno-de-bolso';
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  profile: Profile | null;
  areas: Area[];
  crops: string[];
  entries: Entry[];
  photos: NotebookPhoto[];
  manualChecks: Partial<Record<ManualCheckId, boolean>>;
  lastVisitDate?: string;
}

const ACTIVITY_KINDS: ActivityKind[] = ['plantio', 'adubacao', 'rega', 'manejo', 'colheita', 'venda', 'compra', 'outra'];

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function optString(v: unknown): boolean {
  return v === undefined || typeof v === 'string';
}

function optOneOf(v: unknown, list: { value: string }[]): boolean {
  return v === undefined || (typeof v === 'string' && list.some((i) => i.value === v));
}

function optPositive(v: unknown): boolean {
  return v === undefined || (typeof v === 'number' && Number.isFinite(v) && v > 0);
}

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** Confere todos os campos que o app usa para mostrar, ordenar e somar. */
export function isEntry(v: unknown): v is Entry {
  if (!isObj(v)) return false;
  return (
    nonEmpty(v.id) &&
    typeof v.date === 'string' &&
    parseISODate(v.date) !== null &&
    typeof v.createdAt === 'string' &&
    !Number.isNaN(Date.parse(v.createdAt)) &&
    nonEmpty(v.areaId) &&
    nonEmpty(v.crop) &&
    ACTIVITY_KINDS.includes(v.activity as ActivityKind) &&
    optPositive(v.quantity) &&
    (v.unit === undefined || isUnit(v.unit)) &&
    (v.value === undefined || (typeof v.value === 'number' && Number.isFinite(v.value) && v.value >= 0)) &&
    typeof v.copied === 'boolean' &&
    optString(v.note) &&
    optString(v.variety) &&
    optString(v.photo) &&
    optString(v.photoUri) &&
    optString(v.audio) &&
    optPositive(v.audioSeconds) &&
    optString(v.updatedAt) &&
    optString(v.deletedAt) &&
    optOneOf(v.seedOrigin, SEED_ORIGINS) &&
    optOneOf(v.input, INPUTS) &&
    optOneOf(v.inputOrigin, INPUT_ORIGINS) &&
    optOneOf(v.destination, DESTINATIONS) &&
    optOneOf(v.purchaseKind, PURCHASE_KINDS)
  );
}

export function isArea(v: unknown): v is Area {
  return isObj(v) && nonEmpty(v.id) && nonEmpty(v.name) && optString(v.updatedAt) && optString(v.deletedAt);
}

export function isNotebookPhoto(v: unknown): v is NotebookPhoto {
  return (
    isObj(v) &&
    nonEmpty(v.id) &&
    isRelativeMediaPath(v.file) &&
    typeof v.date === 'string' &&
    parseISODate(v.date) !== null &&
    optString(v.caption) &&
    optString(v.updatedAt) &&
    optString(v.deletedAt)
  );
}

export function isProfile(v: unknown): v is Profile {
  if (!isObj(v) || !nonEmpty(v.name)) return false;
  return (
    ['municipality', 'cooperative', 'opac', 'certificateId', 'nationalRegistry', 'traceCode'].every((k) => optString(v[k])) &&
    (v.certifiedSince === undefined || (typeof v.certifiedSince === 'number' && Number.isInteger(v.certifiedSince)))
  );
}

/** Normaliza a mídia importada e descarta a que não existir neste aparelho. */
function importedMedia(stored: unknown, mediaExists: (relative: string) => boolean): string | undefined {
  const relative = toRelativeMediaPath(typeof stored === 'string' ? stored : undefined);
  return relative && mediaExists(relative) ? relative : undefined;
}

export type ImportResult =
  | {
      ok: true;
      data: BackupData;
      /** Fotos ou recados citados no arquivo que não vieram junto nem existem no aparelho. */
      droppedMedia: number;
      /** Arquivo da versão 1 (só dados, sem fotos do caderno). */
      legacy: boolean;
    }
  | { ok: false; error: string };

const GENERIC_ERROR = 'O arquivo não pôde ser lido. Escolha um arquivo exportado pelo Caderno de Bolso.';

/**
 * Confere um arquivo importado antes de substituir os dados do aparelho.
 * Nunca lança erro: qualquer problema vira uma mensagem amigável.
 */
export function parseBackup(
  text: string,
  mediaExists: (relative: string) => boolean = () => false,
  deps: MigrationDeps = { newId: uuid, now: new Date().toISOString() },
): ImportResult {
  try {
    return parseBackupUnsafe(text, mediaExists, deps);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

function parseBackupUnsafe(
  text: string,
  mediaExists: (relative: string) => boolean,
  deps: MigrationDeps,
): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!isObj(raw) || raw.app !== 'caderno-de-bolso')
    return { ok: false, error: 'Esse arquivo não é uma cópia do Caderno de Bolso.' };
  if (raw.version !== 1 && raw.version !== 2)
    return { ok: false, error: 'Esse arquivo é de uma versão diferente do app.' };
  const profile = raw.profile;
  if (profile !== null && !isProfile(profile))
    return { ok: false, error: 'Os dados do produtor no arquivo estão com problema.' };
  if (!Array.isArray(raw.areas) || !raw.areas.every(isArea))
    return { ok: false, error: 'As áreas no arquivo estão com problema.' };
  if (!Array.isArray(raw.crops) || !raw.crops.every((c) => typeof c === 'string'))
    return { ok: false, error: 'As culturas no arquivo estão com problema.' };
  if (!Array.isArray(raw.entries) || !raw.entries.every(isEntry))
    return { ok: false, error: 'As anotações no arquivo estão com problema.' };

  const rawPhotos = raw.version === 2 ? raw.photos : [];
  if (!Array.isArray(rawPhotos) || !rawPhotos.every(isNotebookPhoto))
    return { ok: false, error: 'As fotos do caderno no arquivo estão com problema.' };

  let droppedMedia = 0;
  const cleanEntries = raw.entries.map((e) => {
    const rawEntry = e as unknown as Record<string, unknown>;
    const { photoUri: _legacy, photo: _photo, audio: _audio, audioSeconds: _seconds, ...rest } = rawEntry;
    const storedPhoto = rawEntry.photo ?? rawEntry.photoUri;
    const photo = importedMedia(storedPhoto, mediaExists);
    const audio = importedMedia(rawEntry.audio, mediaExists);
    if (storedPhoto !== undefined && !photo) droppedMedia += 1;
    if (rawEntry.audio !== undefined && !audio) droppedMedia += 1;
    const out: Record<string, unknown> = { ...rest };
    if (photo) out.photo = photo;
    if (audio) {
      out.audio = audio;
      if (typeof rawEntry.audioSeconds === 'number') out.audioSeconds = rawEntry.audioSeconds;
    }
    return out;
  });
  const photos = rawPhotos.filter((p) => {
    const ok = mediaExists(p.file);
    if (!ok) droppedMedia += 1;
    return ok;
  });
  const exportedAt = typeof raw.exportedAt === 'string' && !Number.isNaN(Date.parse(raw.exportedAt)) ? raw.exportedAt : deps.now;
  const normalized = normalizeRecords(
    { areas: raw.areas as unknown[], entries: cleanEntries, photos: photos as unknown[] },
    { ...deps, now: exportedAt },
  );

  const manualChecks: BackupData['manualChecks'] = {};
  if (isObj(raw.manualChecks)) {
    for (const m of MANUAL_CHECKS) {
      if (raw.manualChecks[m.id] === true) manualChecks[m.id] = true;
    }
  }
  const lastVisitDate =
    typeof raw.lastVisitDate === 'string' && parseISODate(raw.lastVisitDate) ? raw.lastVisitDate : undefined;

  return {
    ok: true,
    droppedMedia,
    legacy: raw.version === 1,
    data: {
      app: 'caderno-de-bolso',
      version: BACKUP_VERSION,
      exportedAt,
      profile: profile as Profile | null,
      areas: normalized.areas as Area[],
      crops: raw.crops,
      entries: normalized.entries as unknown as Entry[],
      photos: normalized.photos as NotebookPhoto[],
      manualChecks,
      lastVisitDate,
    },
  };
}
