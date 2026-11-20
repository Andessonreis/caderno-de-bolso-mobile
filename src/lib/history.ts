import type { ActivityKind, Entry, ISODate } from './types';

export interface HistoryFilter {
  areaId?: string;
  crop?: string;
  activity?: ActivityKind;
}

export interface DayGroup {
  date: ISODate;
  entries: Entry[];
}

export function filterEntries(entries: Entry[], f: HistoryFilter): Entry[] {
  return entries.filter(
    (e) =>
      (!f.areaId || e.areaId === f.areaId) &&
      (!f.crop || e.crop === f.crop) &&
      (!f.activity || e.activity === f.activity),
  );
}

/** Agrupa por dia, do mais recente para o mais antigo. */
export function groupByDay(entries: Entry[]): DayGroup[] {
  const map = new Map<ISODate, Entry[]>();
  for (const e of entries) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => ({ date, entries: list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
}
