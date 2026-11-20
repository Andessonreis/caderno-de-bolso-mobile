import { parseBackup } from '../backup';
import { checkHarvestAndSales } from '../checklist';
import { applyEdit, notebookFieldsChanged } from '../edit';
import { isUuid } from '../ids';
import { isRelativeMediaPath, toRelativeMediaPath } from '../media';
import { migratePersisted } from '../migrate';
import { buildSampleData, removeSampleData } from '../sample';
import type { Entry } from '../types';

function entry(p: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    date: '2026-11-20',
    areaId: 'a1',
    crop: 'feijão',
    activity: 'colheita',
    quantity: 10,
    unit: 'kg',
    copied: true,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    ...p,
  };
}

function backupText(entries: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: 'caderno-de-bolso',
    version: 1,
    exportedAt: '2026-11-20T10:00:00Z',
    profile: { name: 'Ana' },
    areas: [{ id: 'a1', name: 'Horta', updatedAt: '2026-11-01T00:00:00.000Z' }],
    crops: ['feijão'],
    entries,
    manualChecks: {},
    ...extra,
  });
}

describe('fotos com caminho relativo', () => {
  it('reconhece caminho relativo e converte endereço antigo', () => {
    expect(isRelativeMediaPath('anotacoes/1732.jpg')).toBe(true);
    expect(isRelativeMediaPath('../segredo.jpg')).toBe(false);
    expect(isRelativeMediaPath('/data/fotos/x.jpg')).toBe(false);
    expect(toRelativeMediaPath('file:///data/user/0/app/files/fotos/anotacoes/1732.jpg')).toBe('anotacoes/1732.jpg');
    expect(toRelativeMediaPath('caderno/9.png')).toBe('caderno/9.png');
    expect(toRelativeMediaPath('file:///tmp/outra-coisa.jpg')).toBeUndefined();
    expect(toRelativeMediaPath(undefined)).toBeUndefined();
  });

  it('migra dados da versão 1: fotos relativas, ids UUID, updatedAt e fila de alterações', () => {
    let n = 0;
    const deps = { newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, now: '2026-11-21T00:00:00.000Z' };
    const v1 = {
      profile: { name: 'Ana' },
      areas: [{ id: 'velha', name: 'Horta' }],
      entries: [
        { id: '1', areaId: 'velha', createdAt: '2026-11-01T10:00:00.000Z', photoUri: 'file:///x/files/fotos/anotacoes/1.jpg' },
        { id: '2', areaId: 'velha', createdAt: '2026-11-02T10:00:00.000Z', photoUri: 'file:///estranho.jpg' },
      ],
      photos: [
        { id: 'p1', uri: 'file:///x/files/fotos/caderno/2.jpg', date: '2026-11-01' },
        { id: 'p2', uri: 'content://algo', date: '2026-11-01' },
      ],
      lastAreaId: 'velha',
      fontSize: 'grande',
    };
    const out = migratePersisted(v1, 1, deps) as {
      areas: { id: string; updatedAt: string }[];
      entries: { id: string; areaId: string; photo?: string; photoUri?: string; updatedAt: string }[];
      photos: { id: string; file: string }[];
      lastAreaId: string;
      fontSize: string;
      pendingChanges: { entity: string; recordId: string; op: string }[];
    };
    const areaId = out.areas[0].id;
    expect(isUuid(areaId)).toBe(true);
    expect(out.lastAreaId).toBe(areaId);
    expect(out.entries.every((e) => isUuid(e.id) && e.areaId === areaId)).toBe(true);
    expect(out.entries.map((e) => e.photo)).toEqual(['anotacoes/1.jpg', undefined]);
    expect(out.entries.some((e) => 'photoUri' in e)).toBe(false);
    expect(out.entries[0].updatedAt).toBe('2026-11-01T10:00:00.000Z');
    expect(out.photos).toHaveLength(1);
    expect(out.photos[0].file).toBe('caderno/2.jpg');
    expect(out.fontSize).toBe('grande');
    // tudo do produtor entra na fila para a primeira sincronização
    expect(out.pendingChanges.map((c) => c.entity).sort()).toEqual(['anotacao', 'anotacao', 'area', 'culturas', 'pagina', 'perfil', 'visita']);
    expect(out.pendingChanges.every((c) => c.op === 'upsert')).toBe(true);
  });

  it('dados de exemplo não entram na fila de alterações', () => {
    const out = migratePersisted(
      { profile: { name: 'Zé', exemplo: true }, areas: [{ id: 'a', name: 'X', exemplo: true }], entries: [], photos: [] },
      2,
    ) as { pendingChanges: unknown[] };
    expect(out.pendingChanges).toEqual([]);
  });

  it('versão 3 → 4: fila com os nomes do servidor e cópia na internet desligada', () => {
    const deps = { newId: () => 'novo', now: '2026-11-21T00:00:00.000Z' };
    const out = migratePersisted(
      {
        entries: [],
        pendingChanges: [
          { id: 'a', entity: 'entry', recordId: 'e1', op: 'upsert', at: '2026-11-20T00:00:00.000Z' },
          { id: 'b', entity: 'settings', recordId: 'settings', op: 'upsert', at: '2026-11-20T00:00:00.000Z' },
          { id: 'c', entity: 'photo', recordId: 'p1', op: 'delete', at: '2026-11-20T00:00:00.000Z' },
        ],
      },
      3,
      deps,
    ) as { pendingChanges: { entity: string; recordId: string; op: string }[]; sync: unknown; culturasUpdatedAt: string };
    expect(out.pendingChanges.map((c) => `${c.entity}:${c.recordId}:${c.op}`)).toEqual([
      'anotacao:e1:upsert',
      'culturas:culturas:upsert',
      'visita:visita:upsert',
      'pagina:p1:delete',
    ]);
    expect(out.sync).toEqual({ ligado: false, perguntado: false, cursor: 0, enviados: {} });
    expect(out.culturasUpdatedAt).toBe(deps.now);
  });

  it('não mexe em dados já na versão atual', () => {
    const v4 = { entries: [{ id: '1', photo: 'anotacoes/1.jpg' }], photos: [] };
    expect(migratePersisted(v4, 4)).toEqual(v4);
  });
});

describe('importar arquivo', () => {
  it('descarta fotos que não existem no aparelho e aceita o formato antigo', () => {
    const text = backupText([
      entry({ id: 'a', photo: 'anotacoes/tem.jpg' }),
      entry({ id: 'b', photo: 'anotacoes/sumiu.jpg' }),
      { ...entry({ id: 'c' }), photoUri: 'file:///x/fotos/anotacoes/tem2.jpg' },
    ]);
    const exists = (p: string) => p === 'anotacoes/tem.jpg' || p === 'anotacoes/tem2.jpg';
    const r = parseBackup(text, exists);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.entries.map((e) => e.photo)).toEqual(['anotacoes/tem.jpg', undefined, 'anotacoes/tem2.jpg']);
    expect(r.droppedMedia).toBe(1);
    expect(r.legacy).toBe(true);
    expect(r.data.entries.every((e) => !('photoUri' in e))).toBe(true);
  });

  it('exige createdAt válido e campos coerentes', () => {
    const semCreatedAt = { ...entry() } as Partial<Entry>;
    delete semCreatedAt.createdAt;
    expect(parseBackup(backupText([semCreatedAt])).ok).toBe(false);
    expect(parseBackup(backupText([entry({ createdAt: 'ontem' })])).ok).toBe(false);
    expect(parseBackup(backupText([{ ...entry(), quantity: 'muito' }])).ok).toBe(false);
    expect(parseBackup(backupText([{ ...entry(), quantity: -2 }])).ok).toBe(false);
    expect(parseBackup(backupText([{ ...entry(), seedOrigin: 'marte' }])).ok).toBe(false);
    expect(parseBackup(backupText([{ ...entry(), crop: '' }])).ok).toBe(false);
    expect(parseBackup(backupText([{ ...entry(), note: 5 }])).ok).toBe(false);
  });

  it('nunca quebra com conteúdo estranho', () => {
    for (const text of ['', 'null', '[]', '{"app":"caderno-de-bolso","version":1}', backupText([null]), backupText([], { profile: 3 })]) {
      const r = parseBackup(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });

  it('ignora itens manuais e data de visita inválidos', () => {
    const r = parseBackup(backupText([], { manualChecks: { notas: true, dtcs: 'sim', hack: true }, lastVisitDate: '31/02' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.manualChecks).toEqual({ notas: true });
      expect(r.data.lastVisitDate).toBeUndefined();
    }
  });
});

describe('apagar dados de exemplo', () => {
  const sample = buildSampleData('2026-11-20');
  const [canteiro1, , roca] = sample.areas;
  const base = { ...sample, cropUsage: { feijão: 3 }, lastAreaId: canteiro1.id };

  it('usa ids UUID nos dados de exemplo', () => {
    expect([...sample.areas, ...sample.entries].every((r) => isUuid(r.id))).toBe(true);
  });

  it('mantém anotações reais feitas em áreas de exemplo e devolve a mídia do exemplo', () => {
    const real = entry({ id: 'real', areaId: roca.id, copied: false });
    const comMidia = { ...sample.entries[0], photo: 'anotacoes/ex.jpg', audio: 'audios/ex.m4a' };
    const r = removeSampleData({ ...base, entries: [comMidia, ...sample.entries.slice(1), real] });
    expect(r.wasSampleProfile).toBe(true);
    expect(r.state.entries).toEqual([real]);
    expect(r.state.areas).toEqual([{ id: roca.id, name: 'Roça de baixo', updatedAt: roca.updatedAt }]);
    expect(r.promotedAreaIds).toEqual([roca.id]);
    expect(r.state.profile).toBeNull();
    expect(r.state.crops).toEqual(['feijão']);
    expect(r.state.lastAreaId).toBeUndefined();
    expect(r.removedMedia).toEqual(['anotacoes/ex.jpg', 'audios/ex.m4a']);
  });

  it('com perfil real, só sai o que é de exemplo', () => {
    const minha = { id: 'minha', name: 'Quintal', updatedAt: '2026-11-01T00:00:00.000Z' };
    const r = removeSampleData({
      ...base,
      profile: { name: 'Ana' },
      areas: [...sample.areas, minha],
      entries: [...sample.entries, entry({ id: 'm', areaId: 'minha' })],
    });
    expect(r.wasSampleProfile).toBe(false);
    expect(r.state.profile).toEqual({ name: 'Ana' });
    expect(r.state.areas).toEqual([minha]);
    expect(r.state.entries.map((e) => e.id)).toEqual(['m']);
    expect(r.state.cropUsage).toEqual({ feijão: 3 });
    expect(r.promotedAreaIds).toEqual([]);
  });
});

describe('editar anotação já passada a limpo', () => {
  it('volta a ficar pendente quando muda algo do caderno', () => {
    const before = entry();
    const r = applyEdit(before, { ...before, quantity: 12 });
    expect(r.reopened).toBe(true);
    expect(r.entry.copied).toBe(false);
  });

  it('continua passada a limpo se só a foto mudou', () => {
    const before = entry();
    const r = applyEdit(before, { ...before, photo: 'anotacoes/nova.jpg' });
    expect(r.reopened).toBe(false);
    expect(r.entry.copied).toBe(true);
  });

  it('anotação pendente continua pendente sem aviso', () => {
    const before = entry({ copied: false });
    expect(applyEdit(before, { ...before, crop: 'milho' })).toMatchObject({ reopened: false, entry: { copied: false } });
    expect(notebookFieldsChanged(before, { ...before, crop: 'milho' })).toBe(true);
  });
});

describe('colheitas e vendas na lista da visita', () => {
  it('fica pronto só com colheita, mesmo sem venda', () => {
    const item = checkHarvestAndSales([entry({ activity: 'colheita' })]);
    expect(item.done).toBe(true);
    expect(item.missing).toBeUndefined();
  });

  it('falta quando não há colheita', () => {
    const item = checkHarvestAndSales([entry({ activity: 'venda' })]);
    expect(item.done).toBe(false);
    expect(item.missing).toBe('Nenhuma colheita anotada no período.');
  });
});
