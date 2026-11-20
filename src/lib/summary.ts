import { DESTINATIONS, INPUTS, INPUT_ORIGINS, PURCHASE_KINDS, SEED_ORIGINS, activityInfo, labelOf } from './catalog';
import { type DateRange, inRange } from './dates';
import { formatMoney } from './format';
import { quantityText } from './sentence';
import type { ActivityKind, Area, Entry, ISODate, Unit } from './types';

/** Uma linha do resumo, na ordem dos campos do caderno de campo. */
export interface SummaryRow {
  entryId: string;
  date: ISODate;
  areaName: string;
  crop: string;
  activity: string;
  /** Insumo ou semente, com a origem. */
  input: string;
  quantity: string;
  /** Valor, destino ou observação. */
  extra: string;
  copied: boolean;
}

export interface SummaryTotal {
  activity: ActivityKind;
  label: string;
  unit: Unit;
  total: number;
}

export interface CropGroup {
  crop: string;
  rows: SummaryRow[];
  /** Somas por atividade e unidade. Unidades diferentes nunca se somam. */
  totals: SummaryTotal[];
}

export interface AreaGroup {
  areaId: string;
  areaName: string;
  crops: CropGroup[];
}

export interface Summary {
  range: DateRange;
  groups: AreaGroup[];
  count: number;
  pending: number;
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export function areaNameOf(areas: Area[], id: string): string {
  return areas.find((a) => a.id === id)?.name ?? 'Área apagada';
}

/** Texto da coluna "insumo/semente e origem". */
export function inputColumn(e: Entry): string {
  if (e.activity === 'plantio') {
    const parts = [e.variety ? `Semente: ${e.variety}` : 'Semente'];
    parts.push(e.seedOrigin ? labelOf(SEED_ORIGINS, e.seedOrigin).toLowerCase() : 'origem não anotada');
    return parts.join(', ');
  }
  if (e.activity === 'adubacao') {
    const input = labelOf(INPUTS, e.input) || 'Insumo não anotado';
    const origin = e.inputOrigin ? labelOf(INPUT_ORIGINS, e.inputOrigin).toLowerCase() : 'origem não anotada';
    return `${input}, ${origin}`;
  }
  if (e.activity === 'compra') {
    return labelOf(PURCHASE_KINDS, e.purchaseKind) || 'Compra';
  }
  return '';
}

export function extraColumn(e: Entry): string {
  const parts: string[] = [];
  if (e.value !== undefined) parts.push(formatMoney(e.value));
  if (e.destination) parts.push(labelOf(DESTINATIONS, e.destination));
  if (e.note) parts.push(e.note);
  return parts.join(' · ');
}

export function toRow(e: Entry, areaName: string): SummaryRow {
  return {
    entryId: e.id,
    date: e.date,
    areaName,
    crop: e.crop,
    activity: activityInfo(e.activity).label,
    input: inputColumn(e),
    quantity: quantityText(e),
    extra: extraColumn(e),
    copied: e.copied,
  };
}

/** Soma quantidades por atividade e unidade, sem misturar unidades. */
export function sumByActivityAndUnit(entries: Entry[]): SummaryTotal[] {
  const map = new Map<string, SummaryTotal>();
  for (const e of entries) {
    if (e.quantity === undefined || e.unit === undefined) continue;
    const key = `${e.activity}|${e.unit}`;
    const cur = map.get(key);
    if (cur) cur.total += e.quantity;
    else map.set(key, { activity: e.activity, label: activityInfo(e.activity).label, unit: e.unit, total: e.quantity });
  }
  return [...map.values()];
}

export function filterRange(entries: Entry[], range: DateRange): Entry[] {
  return entries.filter((e) => inRange(e.date, range));
}

/**
 * Agrupa as anotações do período por área (na ordem cadastrada) e cultura
 * (ordem alfabética); dentro de cada cultura, as linhas seguem a data.
 */
export function buildSummary(entries: Entry[], areas: Area[], range: DateRange): Summary {
  const selected = filterRange(entries, range);
  const areaOrder = new Map(areas.map((a, i) => [a.id, i]));
  const byArea = new Map<string, Entry[]>();
  for (const e of selected) {
    const list = byArea.get(e.areaId) ?? [];
    list.push(e);
    byArea.set(e.areaId, list);
  }

  const groups: AreaGroup[] = [...byArea.entries()]
    .sort(([a], [b]) => (areaOrder.get(a) ?? Infinity) - (areaOrder.get(b) ?? Infinity))
    .map(([areaId, list]) => {
      const areaName = areaNameOf(areas, areaId);
      const byCrop = new Map<string, Entry[]>();
      for (const e of list) {
        const l = byCrop.get(e.crop) ?? [];
        l.push(e);
        byCrop.set(e.crop, l);
      }
      const crops: CropGroup[] = [...byCrop.entries()]
        .sort(([a], [b]) => collator.compare(a, b))
        .map(([crop, cropEntries]) => {
          const sorted = [...cropEntries].sort(
            (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
          );
          return {
            crop,
            rows: sorted.map((e) => toRow(e, areaName)),
            totals: sumByActivityAndUnit(sorted),
          };
        });
      return { areaId, areaName, crops };
    });

  return {
    range,
    groups,
    count: selected.length,
    pending: selected.filter((e) => !e.copied).length,
  };
}

export function totalText(t: SummaryTotal): string {
  return `${t.label}: ${quantityText({ quantity: t.total, unit: t.unit })}`;
}
