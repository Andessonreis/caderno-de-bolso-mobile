import {
  DESTINATIONS,
  INPUTS,
  INPUT_ORIGINS,
  PURCHASE_KINDS,
  SEED_ORIGINS,
  activityInfo,
  labelOf,
  unitText,
} from './catalog';
import { formatRelativeDay } from './dates';
import { formatMoney, formatNumber } from './format';
import type { Entry, ISODate } from './types';

const FEMININE_START = [
  'roça',
  'horta',
  'área',
  'area',
  'mandala',
  'parcela',
  'quadra',
  'lavoura',
  'chácara',
  'várzea',
  'baixa',
  'terra',
  'malhada',
  'capoeira',
  'cerca',
  'estufa',
  'manga',
];

/** "no Canteiro 1" / "na Roça de baixo". */
export function inArea(name: string): string {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return FEMININE_START.includes(first) ? `na ${name}` : `no ${name}`;
}

export function quantityText(entry: Pick<Entry, 'quantity' | 'unit'>): string {
  if (entry.quantity === undefined || entry.unit === undefined) return '';
  return `${formatNumber(entry.quantity)} ${unitText(entry.unit, entry.quantity)}`;
}

/** O que foi feito, sem data nem área: "colheita de 12 kg de feijão". */
export function describeWhat(entry: Entry): string {
  const qty = quantityText(entry);
  const crop = entry.crop;
  switch (entry.activity) {
    case 'plantio':
      return qty ? `plantio de ${qty} de ${crop}` : `plantio de ${crop}`;
    case 'adubacao': {
      const input = labelOf(INPUTS, entry.input).toLowerCase() || 'adubo';
      return qty ? `adubação de ${crop} com ${qty} de ${input}` : `adubação de ${crop} com ${input}`;
    }
    case 'rega':
      return `rega de ${crop}`;
    case 'manejo':
      return `capina ou manejo de ${crop}`;
    case 'colheita':
      return qty ? `colheita de ${qty} de ${crop}` : `colheita de ${crop}`;
    case 'venda':
      return qty ? `venda de ${qty} de ${crop}` : `venda de ${crop}`;
    case 'compra': {
      const what = entry.purchaseKind === 'insumo' ? 'insumo' : 'semente';
      return qty ? `compra de ${qty} de ${what} para ${crop}` : `compra de ${what} para ${crop}`;
    }
    case 'outra':
      return `anotação sobre ${crop}`;
  }
}

/** Detalhes que completam a frase (origem, valor, destino, observação). */
export function describeDetails(entry: Entry): string[] {
  const out: string[] = [];
  if (entry.activity === 'plantio') {
    if (entry.variety) out.push(`variedade ${entry.variety}`);
    if (entry.seedOrigin) out.push(labelOf(SEED_ORIGINS, entry.seedOrigin).toLowerCase());
  }
  if (entry.activity === 'adubacao' && entry.inputOrigin) {
    out.push(labelOf(INPUT_ORIGINS, entry.inputOrigin).toLowerCase());
  }
  if (entry.activity === 'venda') {
    if (entry.value !== undefined) out.push(`por ${formatMoney(entry.value)}`);
    if (entry.destination) out.push(`para ${labelOf(DESTINATIONS, entry.destination).toLowerCase()}`);
  }
  if (entry.activity === 'compra') {
    if (entry.purchaseKind) out.push(labelOf(PURCHASE_KINDS, entry.purchaseKind).toLowerCase());
    if (entry.value !== undefined) out.push(`pagou ${formatMoney(entry.value)}`);
  }
  if (entry.note) out.push(entry.note);
  return out;
}

/** Frase completa: "Hoje, no Canteiro 1: colheita de 12 kg de feijão". */
export function describeEntry(entry: Entry, areaName: string, ref?: ISODate): string {
  const when = formatRelativeDay(entry.date, ref);
  const details = describeDetails(entry);
  const base = `${when}, ${inArea(areaName)}: ${describeWhat(entry)}`;
  return details.length ? `${base} (${details.join('; ')})` : base;
}

/** Nome da atividade para títulos de lista. */
export function activityTitle(entry: Entry): string {
  return activityInfo(entry.activity).label;
}
