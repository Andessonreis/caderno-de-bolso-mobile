import type { ActivityKind, Entry, Unit } from './types';

/**
 * Ordena itens pelo quanto foram usados (mais usados primeiro), mantendo a
 * ordem original entre os empatados.
 */
export function rankByUsage(items: string[], usage: Record<string, number>): string[] {
  return items
    .map((item, index) => ({ item, index, n: usage[item] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.index - b.index)
    .map((x) => x.item);
}

/** Unidade usada da última vez para a mesma cultura e atividade. */
export function lastUnitFor(entries: Entry[], crop: string, activity: ActivityKind): Unit | undefined {
  let best: Entry | undefined;
  for (const e of entries) {
    if (e.crop !== crop || e.activity !== activity || !e.unit) continue;
    if (!best || e.date > best.date || (e.date === best.date && e.createdAt > best.createdAt)) best = e;
  }
  return best?.unit;
}

/** Conta mais um uso. */
export function bumpUsage(usage: Record<string, number>, key: string): Record<string, number> {
  return { ...usage, [key]: (usage[key] ?? 0) + 1 };
}
