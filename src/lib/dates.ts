import type { ISODate } from './types';

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Converte um Date para AAAA-MM-DD no fuso local. */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Lê AAAA-MM-DD como meia-noite local. Retorna null se a data for inválida. */
export function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
}

function mustParse(s: ISODate): Date {
  const d = parseISODate(s);
  if (!d) throw new Error(`Data inválida: ${s}`);
  return d;
}

export function today(): ISODate {
  return toISODate(new Date());
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = mustParse(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Dias corridos de `from` até `to` (positivo se `to` vem depois). */
export function daysBetween(from: ISODate, to: ISODate): number {
  const a = mustParse(from);
  const b = mustParse(to);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

export interface DateRange {
  start: ISODate;
  end: ISODate;
}

/** Semana de segunda a domingo que contém a data. */
export function weekRange(s: ISODate): DateRange {
  const d = mustParse(s);
  const dow = d.getDay(); // 0 = domingo
  const backToMonday = dow === 0 ? 6 : dow - 1;
  const start = addDays(s, -backToMonday);
  return { start, end: addDays(start, 6) };
}

export function monthRange(s: ISODate): DateRange {
  const d = mustParse(s);
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

/** Move um período inteiro para trás (-1) ou para frente (+1). */
export function shiftRange(kind: 'semana' | 'mes', range: DateRange, step: number): DateRange {
  if (kind === 'semana') return weekRange(addDays(range.start, 7 * step));
  const d = mustParse(range.start);
  return monthRange(toISODate(new Date(d.getFullYear(), d.getMonth() + step, 1)));
}

export function inRange(s: ISODate, range: DateRange): boolean {
  return s >= range.start && s <= range.end;
}

/** "20 de novembro" */
export function formatDayMonth(s: ISODate): string {
  const d = mustParse(s);
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** "quinta, 20 de novembro de 2026" */
export function formatLongDate(s: ISODate): string {
  const d = mustParse(s);
  return `${WEEKDAYS[d.getDay()]}, ${formatDayMonth(s)} de ${d.getFullYear()}`;
}

/** "20/11/2026" */
export function formatShortDate(s: ISODate): string {
  const d = mustParse(s);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "Hoje", "Ontem" ou "quinta, 20 de novembro". */
export function formatRelativeDay(s: ISODate, ref: ISODate = today()): string {
  const diff = daysBetween(s, ref);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  const d = mustParse(s);
  const label = `${WEEKDAYS[d.getDay()]}, ${formatDayMonth(s)}`;
  return d.getFullYear() === mustParse(ref).getFullYear() ? label : `${label} de ${d.getFullYear()}`;
}

export function formatMonthYear(s: ISODate): string {
  const d = mustParse(s);
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Rótulo de um período: "17 a 23 de novembro" ou "novembro de 2026". */
export function formatRange(kind: 'semana' | 'mes', range: DateRange): string {
  if (kind === 'mes') return formatMonthYear(range.start);
  const a = mustParse(range.start);
  const b = mustParse(range.end);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} a ${formatDayMonth(range.end)}`;
  return `${formatDayMonth(range.start)} a ${formatDayMonth(range.end)}`;
}
