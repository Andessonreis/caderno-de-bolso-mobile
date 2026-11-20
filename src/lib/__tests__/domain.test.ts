import { parseBackup } from '../backup';
import { computeChecklist, lastBackupDate, visitPeriod } from '../checklist';
import { barRatio, harvestByCrop } from '../harvest';
import { escapeHtml, summaryHtml } from '../html';
import { qrSvg } from '../qr';
import { buildSampleData } from '../sample';
import { describeEntry, inArea } from '../sentence';
import { buildSummary, sumByActivityAndUnit } from '../summary';
import type { Area, Entry } from '../types';
import { bumpUsage, lastUnitFor, rankByUsage } from '../usage';
import { filterEntries, groupByDay } from '../history';

let seq = 0;
function entry(p: Partial<Entry> & Pick<Entry, 'activity' | 'crop' | 'date'>): Entry {
  seq += 1;
  return { id: `e${seq}`, areaId: 'a1', copied: false, createdAt: `${p.date}T10:00:0${seq % 10}.000Z`, ...p };
}

const areas: Area[] = [
  { id: 'a1', name: 'Canteiro 1' },
  { id: 'a2', name: 'Roça de baixo' },
];

describe('frase da anotação', () => {
  it('monta a frase do jeito falado', () => {
    const e = entry({ activity: 'colheita', crop: 'feijão', date: '2026-11-20', quantity: 12, unit: 'kg' });
    expect(describeEntry(e, 'Canteiro 1', '2026-11-20')).toBe('Hoje, no Canteiro 1: colheita de 12 kg de feijão');
  });

  it('usa "na" para áreas femininas e mostra detalhes da venda', () => {
    expect(inArea('Roça de baixo')).toBe('na Roça de baixo');
    const e = entry({
      activity: 'venda',
      crop: 'coentro',
      date: '2026-11-19',
      quantity: 1,
      unit: 'maco',
      value: 3.5,
      destination: 'feira',
    });
    expect(describeEntry(e, 'Horta', '2026-11-20')).toBe('Ontem, na Horta: venda de 1 maço de coentro (por R$ 3,50; para feira)');
  });
});

describe('resumo', () => {
  const entries = [
    entry({ activity: 'colheita', crop: 'feijão', date: '2026-11-18', quantity: 10, unit: 'kg', areaId: 'a2' }),
    entry({ activity: 'colheita', crop: 'feijão', date: '2026-11-17', quantity: 5, unit: 'kg', areaId: 'a2', copied: true }),
    entry({ activity: 'colheita', crop: 'feijão', date: '2026-11-19', quantity: 1, unit: 'saca', areaId: 'a2' }),
    entry({ activity: 'plantio', crop: 'alface', date: '2026-11-16', quantity: 30, unit: 'unidade', seedOrigin: 'propria' }),
    entry({ activity: 'rega', crop: 'alface', date: '2026-11-16' }),
    entry({ activity: 'colheita', crop: 'couve', date: '2026-11-10', quantity: 3, unit: 'maco' }),
  ];

  it('agrupa por área (ordem cadastrada) e cultura, com linhas por data', () => {
    const s = buildSummary(entries, areas, { start: '2026-11-16', end: '2026-11-22' });
    expect(s.count).toBe(5);
    expect(s.pending).toBe(4);
    expect(s.groups.map((g) => g.areaName)).toEqual(['Canteiro 1', 'Roça de baixo']);
    const feijao = s.groups[1].crops[0];
    expect(feijao.rows.map((r) => r.date)).toEqual(['2026-11-17', '2026-11-18', '2026-11-19']);
    expect(feijao.rows[0]).toMatchObject({ areaName: 'Roça de baixo', crop: 'feijão', activity: 'Colheita', quantity: '5 kg' });
  });

  it('nunca soma unidades diferentes', () => {
    const totals = sumByActivityAndUnit(entries.filter((e) => e.crop === 'feijão'));
    expect(totals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ activity: 'colheita', unit: 'kg', total: 15 }),
        expect.objectContaining({ activity: 'colheita', unit: 'saca', total: 1 }),
      ]),
    );
    expect(totals).toHaveLength(2);
  });

  it('coluna de semente mostra a origem', () => {
    const s = buildSummary(entries, areas, { start: '2026-11-16', end: '2026-11-22' });
    const plantio = s.groups[0].crops[0].rows.find((r) => r.activity === 'Plantio');
    expect(plantio?.input).toBe('Semente, semente própria');
  });

  it('gera HTML escapado', () => {
    const s = buildSummary(
      [entry({ activity: 'outra', crop: '<b>x</b>', date: '2026-11-20', note: 'a & b' })],
      areas,
      { start: '2026-11-16', end: '2026-11-22' },
    );
    const html = summaryHtml({ title: 'Resumo', periodLabel: 'semana', profile: { name: 'Zé' }, summary: s });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('a &amp; b');
    expect(html).not.toContain('<b>x</b>');
    expect(escapeHtml(`"'`)).toBe('&quot;&#39;');
  });
});

describe('colheita e venda', () => {
  const range = { start: '2026-11-01', end: '2026-11-30' };
  it('saldo só quando a unidade bate', () => {
    const r = harvestByCrop(
      [
        entry({ activity: 'colheita', crop: 'tomate', date: '2026-11-02', quantity: 4, unit: 'caixa' }),
        entry({ activity: 'venda', crop: 'tomate', date: '2026-11-03', quantity: 3, unit: 'caixa', value: 90 }),
        entry({ activity: 'venda', crop: 'tomate', date: '2026-11-04', quantity: 20, unit: 'kg', value: 80.5 }),
        entry({ activity: 'venda', crop: 'tomate', date: '2026-11-05', quantity: 2, unit: 'kg' }),
        entry({ activity: 'colheita', crop: 'tomate', date: '2026-10-30', quantity: 99, unit: 'caixa' }),
      ],
      range,
    );
    expect(r).toHaveLength(1);
    const t = r[0];
    expect(t.received).toBe(170.5);
    expect(t.salesWithoutValue).toBe(1);
    expect(t.units.find((u) => u.unit === 'caixa')).toEqual({ unit: 'caixa', harvested: 4, sold: 3, balance: 1 });
    expect(t.units.find((u) => u.unit === 'kg')).toEqual({ unit: 'kg', harvested: 0, sold: 22, balance: null });
  });

  it('barras proporcionais', () => {
    expect(barRatio(5, 10)).toBe(0.5);
    expect(barRatio(0, 10)).toBe(0);
    expect(barRatio(3, 0)).toBe(0);
    expect(barRatio(20, 10)).toBe(1);
  });
});

describe('lista de conferência', () => {
  const today = '2026-11-20';

  it('marca tudo pronto quando os registros estão completos', () => {
    const c = computeChecklist({
      today,
      entries: [
        entry({ activity: 'plantio', crop: 'milho crioulo', date: '2026-11-15', seedOrigin: 'banco' }),
        entry({ activity: 'adubacao', crop: 'milho crioulo', date: '2026-11-16', input: 'esterco', inputOrigin: 'proprio' }),
        entry({ activity: 'colheita', crop: 'alface', date: '2026-11-18', quantity: 5, unit: 'unidade', copied: true }),
        entry({ activity: 'venda', crop: 'alface', date: '2026-11-18', quantity: 5, unit: 'unidade' }),
      ],
      photos: [{ id: 'p', uri: 'file://x', date: '2026-11-01' }],
      manual: { notas: true, dtcs: true, plano: true, separacao: true, pendencias: true },
    });
    expect(c.items.every((i) => i.done)).toBe(true);
    expect(c.done).toBe(c.total);
  });

  it('aponta o que falta e destaca milho e feijão', () => {
    const c = computeChecklist({
      today,
      entries: [
        entry({ activity: 'plantio', crop: 'feijão', date: '2026-11-01' }),
        entry({ activity: 'adubacao', crop: 'feijão', date: '2026-11-02', input: 'esterco' }),
      ],
      photos: [],
      lastExportAt: '2026-09-01',
      manual: {},
    });
    const byId = Object.fromEntries(c.items.map((i) => [i.id, i]));
    expect(byId.caderno.done).toBe(false);
    expect(byId.caderno.missing).toContain('últimos 7 dias');
    expect(byId.caderno.missing).toContain('mais de 14 dias');
    expect(byId.sementes.done).toBe(false);
    expect(byId.sementes.missing).toContain('não é transgênico');
    expect(byId.insumos.done).toBe(false);
    expect(byId['colheita-venda'].done).toBe(false);
    expect(byId.copia.done).toBe(false);
    expect(byId.copia.missing).toContain('mais de 30 dias');
    expect(c.items.filter((i) => !i.auto).every((i) => !i.done)).toBe(true);
  });

  it('considera só o período desde a última visita', () => {
    expect(visitPeriod('2026-10-01', today)).toEqual({ start: '2026-10-01', end: today });
    const c = computeChecklist({
      today,
      lastVisitDate: '2026-11-10',
      entries: [entry({ activity: 'plantio', crop: 'feijão', date: '2026-11-01' })],
      photos: [],
      manual: {},
    });
    expect(c.items.find((i) => i.id === 'sementes')?.done).toBe(true);
  });

  it('usa a cópia mais recente', () => {
    expect(lastBackupDate([{ id: '1', uri: '', date: '2026-10-01' }], '2026-11-02')).toBe('2026-11-02');
    expect(lastBackupDate([], undefined)).toBeUndefined();
  });
});

describe('cópia de segurança (arquivo)', () => {
  it('aceita um arquivo válido', () => {
    const sample = buildSampleData('2026-11-20');
    const text = JSON.stringify({
      app: 'caderno-de-bolso',
      version: 1,
      exportedAt: '2026-11-20T10:00:00Z',
      profile: sample.profile,
      areas: sample.areas,
      crops: sample.crops,
      entries: sample.entries,
      manualChecks: { notas: true },
    });
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.entries).toHaveLength(sample.entries.length);
  });

  it('recusa arquivos estranhos', () => {
    expect(parseBackup('não é json').ok).toBe(false);
    expect(parseBackup('{"app":"outro"}').ok).toBe(false);
    const bad = parseBackup(
      JSON.stringify({ app: 'caderno-de-bolso', version: 1, profile: null, areas: [], crops: [], entries: [{ id: 1 }] }),
    );
    expect(bad).toEqual({ ok: false, error: 'As anotações no arquivo estão com problema.' });
  });
});

describe('dados de exemplo', () => {
  it('cobrem cerca de 3 semanas e apontam áreas existentes', () => {
    const s = buildSampleData('2026-11-20');
    const ids = new Set(s.areas.map((a) => a.id));
    expect(s.entries.every((e) => ids.has(e.areaId) && e.exemplo)).toBe(true);
    const dates = s.entries.map((e) => e.date).sort();
    expect(dates[0]).toBe('2026-10-31');
    expect(dates.at(-1)).toBe('2026-11-20');
  });
});

describe('preferências', () => {
  it('culturas mais usadas sobem', () => {
    let u: Record<string, number> = {};
    u = bumpUsage(u, 'feijão');
    u = bumpUsage(u, 'feijão');
    u = bumpUsage(u, 'couve');
    expect(rankByUsage(['alface', 'couve', 'feijão', 'milho'], u)).toEqual(['feijão', 'couve', 'alface', 'milho']);
  });

  it('lembra a última unidade usada para a cultura e atividade', () => {
    const list = [
      entry({ activity: 'colheita', crop: 'tomate', date: '2026-11-01', quantity: 1, unit: 'caixa' }),
      entry({ activity: 'colheita', crop: 'tomate', date: '2026-11-03', quantity: 9, unit: 'kg' }),
      entry({ activity: 'venda', crop: 'tomate', date: '2026-11-05', quantity: 1, unit: 'saca' }),
    ];
    expect(lastUnitFor(list, 'tomate', 'colheita')).toBe('kg');
    expect(lastUnitFor(list, 'alface', 'colheita')).toBeUndefined();
  });
});

describe('QR do cartão', () => {
  it('gera SVG', () => {
    const svg = qrSvg('https://exemplo.app/ficha#d=abc');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<path d="M');
  });
});

describe('caderno (histórico)', () => {
  const list = [
    entry({ activity: 'colheita', crop: 'feijão', date: '2026-11-18', areaId: 'a1' }),
    entry({ activity: 'rega', crop: 'alface', date: '2026-11-20', areaId: 'a2' }),
    entry({ activity: 'colheita', crop: 'alface', date: '2026-11-18', areaId: 'a2' }),
  ];

  it('filtra por área, cultura e atividade', () => {
    expect(filterEntries(list, { areaId: 'a2' })).toHaveLength(2);
    expect(filterEntries(list, { crop: 'alface', activity: 'colheita' })).toHaveLength(1);
    expect(filterEntries(list, {})).toHaveLength(3);
  });

  it('agrupa por dia, mais recente primeiro', () => {
    const g = groupByDay(list);
    expect(g.map((d) => d.date)).toEqual(['2026-11-20', '2026-11-18']);
    expect(g[1].entries).toHaveLength(2);
  });
});
