import { isUnit } from './catalog';
import { parseISODate } from './dates';
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

function isEntry(v: unknown): v is Entry {
  if (!isObj(v)) return false;
  return (
    typeof v.id === 'string' &&
    typeof v.date === 'string' &&
    parseISODate(v.date) !== null &&
    typeof v.areaId === 'string' &&
    typeof v.crop === 'string' &&
    ACTIVITY_KINDS.includes(v.activity as ActivityKind) &&
    (v.quantity === undefined || typeof v.quantity === 'number') &&
    (v.unit === undefined || isUnit(v.unit)) &&
    (v.value === undefined || typeof v.value === 'number') &&
    typeof v.copied === 'boolean'
  );
}

function isArea(v: unknown): v is Area {
  return isObj(v) && typeof v.id === 'string' && typeof v.name === 'string';
}

export type ImportResult = { ok: true; data: BackupData } | { ok: false; error: string };

/** Confere um arquivo importado antes de substituir os dados do aparelho. */
export function parseBackup(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'O arquivo não pôde ser lido. Escolha um arquivo exportado pelo Caderno de Bolso.' };
  }
  if (!isObj(raw) || raw.app !== 'caderno-de-bolso')
    return { ok: false, error: 'Esse arquivo não é uma cópia do Caderno de Bolso.' };
  if (raw.version !== 1) return { ok: false, error: 'Esse arquivo é de uma versão diferente do app.' };
  const profile = raw.profile;
  if (profile !== null && !(isObj(profile) && typeof profile.name === 'string'))
    return { ok: false, error: 'Os dados do produtor no arquivo estão com problema.' };
  if (!Array.isArray(raw.areas) || !raw.areas.every(isArea))
    return { ok: false, error: 'As áreas no arquivo estão com problema.' };
  if (!Array.isArray(raw.crops) || !raw.crops.every((c) => typeof c === 'string'))
    return { ok: false, error: 'As culturas no arquivo estão com problema.' };
  if (!Array.isArray(raw.entries) || !raw.entries.every(isEntry))
    return { ok: false, error: 'As anotações no arquivo estão com problema.' };
  const manualChecks = isObj(raw.manualChecks) ? (raw.manualChecks as BackupData['manualChecks']) : {};
  return {
    ok: true,
    data: {
      app: 'caderno-de-bolso',
      version: 1,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      profile: profile as Profile | null,
      areas: raw.areas,
      crops: raw.crops,
      entries: raw.entries,
      manualChecks,
      lastVisitDate: typeof raw.lastVisitDate === 'string' ? raw.lastVisitDate : undefined,
    },
  };
}
