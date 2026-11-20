import { type DateRange, inRange } from './dates';
import type { Entry, Unit } from './types';

export interface UnitBalance {
  unit: Unit;
  harvested: number;
  sold: number;
  /** Colhido − vendido. Só existe quando houve colheita nessa mesma unidade. */
  balance: number | null;
}

export interface CropHarvest {
  crop: string;
  units: UnitBalance[];
  /** Soma dos valores de venda informados, em reais. */
  received: number;
  /** Vendas sem valor informado (para avisar que o total pode estar incompleto). */
  salesWithoutValue: number;
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * Colheita e venda por cultura no período. Quantidades só se somam dentro da
 * mesma unidade; o saldo só aparece quando colheita e venda usam a mesma unidade.
 */
export function harvestByCrop(entries: Entry[], range: DateRange): CropHarvest[] {
  const crops = new Map<string, { units: Map<Unit, { harvested: number; sold: number }>; received: number; noValue: number }>();

  for (const e of entries) {
    if (e.activity !== 'colheita' && e.activity !== 'venda') continue;
    if (!inRange(e.date, range)) continue;
    const cur = crops.get(e.crop) ?? { units: new Map(), received: 0, noValue: 0 };
    if (e.quantity !== undefined && e.unit !== undefined) {
      const u = cur.units.get(e.unit) ?? { harvested: 0, sold: 0 };
      if (e.activity === 'colheita') u.harvested += e.quantity;
      else u.sold += e.quantity;
      cur.units.set(e.unit, u);
    }
    if (e.activity === 'venda') {
      if (e.value !== undefined) cur.received += e.value;
      else cur.noValue += 1;
    }
    crops.set(e.crop, cur);
  }

  return [...crops.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([crop, c]) => ({
      crop,
      received: Math.round(c.received * 100) / 100,
      salesWithoutValue: c.noValue,
      units: [...c.units.entries()].map(([unit, t]) => ({
        unit,
        harvested: t.harvested,
        sold: t.sold,
        balance: t.harvested > 0 ? Math.round((t.harvested - t.sold) * 100) / 100 : null,
      })),
    }));
}

/** Proporção de 0 a 1 para desenhar uma barra, relativa ao maior valor. */
export function barRatio(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(1, value / max);
}
