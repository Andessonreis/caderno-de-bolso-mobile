import { DESTINATIONS, INPUTS, INPUT_ORIGINS, MANUAL_CHECKS, PURCHASE_KINDS, SEED_ORIGINS, isUnit } from './catalog';
import { parseISODate } from './dates';
import { toRelativePhotoPath } from './photos';
import type { ActivityKind, Area, Entry, ManualCheckId, Profile } from './types';

/**
 * Dados que vão no arquivo de exportação. As fotos não vão (deixariam o arquivo
 * enorme); elas continuam guardadas no aparelho.
 */
export interface BackupData {
  app: 'caderno-de-bolso';
  version: 1;
  exportedAt: string;
  profile: Profile | null;
  areas: Area[];
  crops: string[];
  entries: Entry[];
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
    optOneOf(v.seedOrigin, SEED_ORIGINS) &&
    optOneOf(v.input, INPUTS) &&
    optOneOf(v.inputOrigin, INPUT_ORIGINS) &&
    optOneOf(v.destination, DESTINATIONS) &&
    optOneOf(v.purchaseKind, PURCHASE_KINDS)
  );
}

function isArea(v: unknown): v is Area {
  return isObj(v) && nonEmpty(v.id) && nonEmpty(v.name);
}

function isProfile(v: unknown): v is Profile {
  if (!isObj(v) || !nonEmpty(v.name)) return false;
  return (
    ['municipality', 'cooperative', 'opac', 'certificateId', 'nationalRegistry', 'traceCode'].every((k) => optString(v[k])) &&
    (v.certifiedSince === undefined || (typeof v.certifiedSince === 'number' && Number.isInteger(v.certifiedSince)))
  );
}

/**
 * Normaliza a foto de uma anotação importada: aceita o caminho relativo ou o
 * endereço completo antigo, e descarta se a foto não existir neste aparelho.
 */
function importedPhoto(raw: Record<string, unknown>, photoExists: (relative: string) => boolean): string | undefined {
  const stored = typeof raw.photo === 'string' ? raw.photo : typeof raw.photoUri === 'string' ? raw.photoUri : undefined;
  const relative = toRelativePhotoPath(stored);
  return relative && photoExists(relative) ? relative : undefined;
}

export type ImportResult = { ok: true; data: BackupData; droppedPhotos: number } | { ok: false; error: string };

const GENERIC_ERROR = 'O arquivo não pôde ser lido. Escolha um arquivo exportado pelo Caderno de Bolso.';

/**
 * Confere um arquivo importado antes de substituir os dados do aparelho.
 * Nunca lança erro: qualquer problema vira uma mensagem amigável.
 */
export function parseBackup(text: string, photoExists: (relative: string) => boolean = () => false): ImportResult {
  try {
    return parseBackupUnsafe(text, photoExists);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

function parseBackupUnsafe(text: string, photoExists: (relative: string) => boolean): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
  if (!isObj(raw) || raw.app !== 'caderno-de-bolso')
    return { ok: false, error: 'Esse arquivo não é uma cópia do Caderno de Bolso.' };
  if (raw.version !== 1) return { ok: false, error: 'Esse arquivo é de uma versão diferente do app.' };
  const profile = raw.profile;
  if (profile !== null && !isProfile(profile))
    return { ok: false, error: 'Os dados do produtor no arquivo estão com problema.' };
  if (!Array.isArray(raw.areas) || !raw.areas.every(isArea))
    return { ok: false, error: 'As áreas no arquivo estão com problema.' };
  if (!Array.isArray(raw.crops) || !raw.crops.every((c) => typeof c === 'string'))
    return { ok: false, error: 'As culturas no arquivo estão com problema.' };
  if (!Array.isArray(raw.entries) || !raw.entries.every(isEntry))
    return { ok: false, error: 'As anotações no arquivo estão com problema.' };

  let droppedPhotos = 0;
  const entries: Entry[] = raw.entries.map((e) => {
    const rawEntry = e as unknown as Record<string, unknown>;
    const { photoUri: _legacy, ...rest } = rawEntry;
    const hadPhoto = typeof rawEntry.photo === 'string' || typeof rawEntry.photoUri === 'string';
    const photo = importedPhoto(rawEntry, photoExists);
    if (hadPhoto && !photo) droppedPhotos += 1;
    return { ...(rest as unknown as Entry), photo };
  });

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
    droppedPhotos,
    data: {
      app: 'caderno-de-bolso',
      version: 1,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      profile: profile as Profile | null,
      areas: raw.areas,
      crops: raw.crops,
      entries,
      manualChecks,
      lastVisitDate,
    },
  };
}
