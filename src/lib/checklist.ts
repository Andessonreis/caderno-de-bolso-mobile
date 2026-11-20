import { MANUAL_CHECKS, needsSeedProof } from './catalog';
import { type DateRange, addDays, daysBetween, formatShortDate } from './dates';
import type { Entry, ISODate, ManualCheckId, NotebookPhoto } from './types';

export interface CheckItem {
  id: string;
  label: string;
  done: boolean;
  /** true = o app confere sozinho a partir das anotações. */
  auto: boolean;
  /** Por que esse item importa ou como foi conferido. */
  why: string;
  /** O que falta fazer, quando não está pronto. */
  missing?: string;
}

export interface ChecklistInput {
  entries: Entry[];
  photos: NotebookPhoto[];
  lastExportAt?: ISODate;
  manual: Partial<Record<ManualCheckId, boolean>>;
  lastVisitDate?: ISODate;
  today: ISODate;
}

/** Quantos dias para trás olhar quando a data da última visita não foi informada. */
export const DEFAULT_PERIOD_DAYS = 120;

/** Período considerado: da última visita até hoje. */
export function visitPeriod(lastVisitDate: ISODate | undefined, today: ISODate): DateRange {
  const start = lastVisitDate && lastVisitDate <= today ? lastVisitDate : addDays(today, -DEFAULT_PERIOD_DAYS);
  return { start, end: today };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function checkNotebookUpToDate(entries: Entry[], today: ISODate): CheckItem {
  const recent = entries.some((e) => {
    const d = daysBetween(e.date, today);
    return d >= 0 && d <= 7;
  });
  const oldPending = entries.filter((e) => !e.copied && daysBetween(e.date, today) > 14);
  const done = recent && oldPending.length === 0;
  const problems: string[] = [];
  if (!recent) problems.push('Não há anotação nos últimos 7 dias.');
  if (oldPending.length)
    problems.push(
      `${plural(oldPending.length, 'anotação de mais de 14 dias ainda não foi passada', 'anotações de mais de 14 dias ainda não foram passadas')} para o caderno de papel. Veja em Resumos.`,
    );
  return {
    id: 'caderno',
    label: 'Caderno em dia',
    auto: true,
    done,
    why: 'Anotou algo nos últimos 7 dias e não tem nada esperando para passar a limpo há mais de 14 dias.',
    missing: done ? undefined : problems.join(' '),
  };
}

export function checkSeedOrigin(periodEntries: Entry[]): CheckItem {
  const plantings = periodEntries.filter((e) => e.activity === 'plantio');
  const missing = plantings.filter((e) => !e.seedOrigin);
  const crops = [...new Set(missing.map((e) => e.crop))];
  const proofCrops = crops.filter(needsSeedProof);
  let missingText: string | undefined;
  if (missing.length) {
    missingText = `Falta a origem da semente em ${plural(missing.length, 'plantio', 'plantios')} (${crops.join(', ')}). Abra no Caderno e complete.`;
    if (proofCrops.length)
      missingText +=
        ' Atenção: milho e feijão precisam de comprovação de origem da semente e declaração de que não é transgênico.';
  }
  return {
    id: 'sementes',
    label: 'Origem das sementes anotada',
    auto: true,
    done: missing.length === 0,
    why: plantings.length
      ? `${plural(plantings.length, 'plantio conferido', 'plantios conferidos')} no período. Para milho e feijão, guarde também a comprovação de origem e a declaração de não transgênico.`
      : 'Nenhum plantio anotado no período, então não há origem para conferir.',
    missing: missingText,
  };
}

export function checkInputs(periodEntries: Entry[]): CheckItem {
  const uses = periodEntries.filter((e) => e.activity === 'adubacao');
  const missing = uses.filter((e) => !e.input || !e.inputOrigin);
  return {
    id: 'insumos',
    label: 'Adubos e caldas anotados com origem',
    auto: true,
    done: missing.length === 0,
    why: uses.length
      ? `${plural(uses.length, 'adubação ou calda conferida', 'adubações ou caldas conferidas')} no período.`
      : 'Nenhuma adubação ou calda anotada no período.',
    missing: missing.length
      ? `Falta dizer qual insumo ou de onde veio em ${plural(missing.length, 'anotação', 'anotações')}.`
      : undefined,
  };
}

export function checkHarvestAndSales(periodEntries: Entry[]): CheckItem {
  const harvests = periodEntries.filter((e) => e.activity === 'colheita').length;
  const sales = periodEntries.filter((e) => e.activity === 'venda').length;
  const problems: string[] = [];
  if (!harvests) problems.push('Nenhuma colheita anotada no período.');
  if (!sales) problems.push('Nenhuma venda anotada no período. Se não vendeu nada, tudo bem.');
  return {
    id: 'colheita-venda',
    label: 'Colheitas e vendas anotadas',
    auto: true,
    done: harvests > 0 && sales > 0,
    why: `${plural(harvests, 'colheita', 'colheitas')} e ${plural(sales, 'venda', 'vendas')} no período. Ajuda a mostrar que o que foi vendido saiu da sua roça.`,
    missing: problems.length ? problems.join(' ') : undefined,
  };
}

/** Data mais recente de cópia de segurança (foto do caderno ou exportação). */
export function lastBackupDate(photos: NotebookPhoto[], lastExportAt?: ISODate): ISODate | undefined {
  const dates = photos.map((p) => p.date);
  if (lastExportAt) dates.push(lastExportAt);
  if (!dates.length) return undefined;
  return dates.sort().at(-1);
}

export function checkBackup(photos: NotebookPhoto[], lastExportAt: ISODate | undefined, today: ISODate): CheckItem {
  const last = lastBackupDate(photos, lastExportAt);
  const age = last ? daysBetween(last, today) : undefined;
  const done = age !== undefined && age <= 30;
  return {
    id: 'copia',
    label: 'Cópia de segurança do caderno',
    auto: true,
    done,
    why: last
      ? `Última cópia em ${formatShortDate(last)}. Fotografar as páginas protege se o caderno molhar ou se perder.`
      : 'Fotografar as páginas protege se o caderno molhar ou se perder.',
    missing: done
      ? undefined
      : last
        ? 'A última cópia tem mais de 30 dias. Fotografe as páginas novas em "Cópia de segurança".'
        : 'Ainda não tem cópia. Fotografe as páginas do caderno em "Cópia de segurança".',
  };
}

export interface Checklist {
  items: CheckItem[];
  done: number;
  total: number;
  period: DateRange;
}

export function computeChecklist(input: ChecklistInput): Checklist {
  const period = visitPeriod(input.lastVisitDate, input.today);
  const periodEntries = input.entries.filter((e) => e.date >= period.start && e.date <= period.end);
  const auto = [
    checkNotebookUpToDate(input.entries, input.today),
    checkSeedOrigin(periodEntries),
    checkInputs(periodEntries),
    checkHarvestAndSales(periodEntries),
    checkBackup(input.photos, input.lastExportAt, input.today),
  ];
  const manual: CheckItem[] = MANUAL_CHECKS.map((m) => ({
    id: m.id,
    label: m.label,
    auto: false,
    done: Boolean(input.manual[m.id]),
    why: m.help,
  }));
  const items = [...auto, ...manual];
  return { items, done: items.filter((i) => i.done).length, total: items.length, period };
}
