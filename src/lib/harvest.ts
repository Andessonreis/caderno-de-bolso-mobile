import { type DateRange, inRange } from './dates';
import type { Entry, Unit } from './types';

export interface UnitBalance {
  unit: Unit;
  /** Colhido no período. */
  harvested: number;
  /** Vendido no período. */
  sold: number;
  /**
   * Saldo acumulado até o fim do período: toda colheita menos toda venda
   * anotadas até ali, nessa mesma unidade. null quando nunca houve colheita
   * nessa unidade (não dá para comparar).
   */
  stock: number | null;
  /** Vendeu mais do que colheu, somando tudo até o fim do período. */
  oversold: boolean;
}

export interface CropHarvest {
  crop: string;
  units: UnitBalance[];
  /** Soma dos valores de venda informados no período, em reais. */
  received: number;
  /** Vendas do período sem valor informado (o total pode estar incompleto). */
  salesWithoutValue: number;
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Colheita e venda por cultura no período. Quantidades só se somam dentro da
 * mesma unidade. O saldo é acumulado (desde a primeira anotação até o fim do
 * período), para não acusar "vendeu a mais" quando a colheita caiu no período
 * anterior (colheu no domingo, vendeu na segunda).
 */
export function harvestByCrop(entries: Entry[], range: DateRange): CropHarvest[] {
  type Acc = { harvested: number; sold: number; totalHarvested: number; totalSold: number };
  const crops = new Map<string, { units: Map<Unit, Acc>; received: number; noValue: number; inPeriod: boolean }>();

  for (const e of entries) {
    if (e.activity !== 'colheita' && e.activity !== 'venda') continue;
    if (e.date > range.end) continue;
    const period = inRange(e.date, range);
    const cur = crops.get(e.crop) ?? { units: new Map(), received: 0, noValue: 0, inPeriod: false };
    if (period) cur.inPeriod = true;
    if (e.quantity !== undefined && e.unit !== undefined) {
      const u = cur.units.get(e.unit) ?? { harvested: 0, sold: 0, totalHarvested: 0, totalSold: 0 };
      if (e.activity === 'colheita') {
        u.totalHarvested += e.quantity;
        if (period) u.harvested += e.quantity;
      } else {
        u.totalSold += e.quantity;
        if (period) u.sold += e.quantity;
      }
      cur.units.set(e.unit, u);
    }
    if (period && e.activity === 'venda') {
      if (e.value !== undefined) cur.received += e.value;
      else cur.noValue += 1;
    }
    crops.set(e.crop, cur);
  }

  return [...crops.entries()]
    .filter(([, c]) => c.inPeriod)
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([crop, c]) => ({
      crop,
      received: round2(c.received),
      salesWithoutValue: c.noValue,
      units: [...c.units.entries()]
        .filter(([, t]) => t.harvested > 0 || t.sold > 0)
        .map(([unit, t]) => {
          const stock = t.totalHarvested > 0 ? round2(t.totalHarvested - t.totalSold) : null;
          return {
            unit,
            harvested: round2(t.harvested),
            sold: round2(t.sold),
            stock,
            oversold: stock !== null && stock < 0,
          };
        }),
    }));
}

/** Proporção de 0 a 1 para desenhar uma barra, relativa ao maior valor. */
export function barRatio(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(1, value / max);
}
