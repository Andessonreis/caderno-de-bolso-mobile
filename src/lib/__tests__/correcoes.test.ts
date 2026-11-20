import { parseBackup } from '../backup';
import { checkHarvestAndSales } from '../checklist';
import { applyEdit, notebookFieldsChanged } from '../edit';
import { migratePersisted } from '../migrate';
import { isRelativePhotoPath, toRelativePhotoPath } from '../photos';
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
    ...p,
  };
}

function backupText(entries: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: 'caderno-de-bolso',
    version: 1,
    exportedAt: '2026-11-20T10:00:00Z',
    profile: { name: 'Ana' },
    areas: [{ id: 'a1', name: 'Horta' }],
    crops: ['feijão'],
    entries,
    manualChecks: {},
    ...extra,
  });
}

describe('fotos com caminho relativo', () => {
  it('reconhece caminho relativo e converte endereço antigo', () => {
    expect(isRelativePhotoPath('anotacoes/1732.jpg')).toBe(true);
    expect(isRelativePhotoPath('../segredo.jpg')).toBe(false);
    expect(isRelativePhotoPath('/data/fotos/x.jpg')).toBe(false);
    expect(toRelativePhotoPath('file:///data/user/0/app/files/fotos/anotacoes/1732.jpg')).toBe('anotacoes/1732.jpg');
    expect(toRelativePhotoPath('caderno/9.png')).toBe('caderno/9.png');
    expect(toRelativePhotoPath('file:///tmp/outra-coisa.jpg')).toBeUndefined();
    expect(toRelativePhotoPath(undefined)).toBeUndefined();
  });

  it('migra dados da versão 1 para caminhos relativos', () => {
    const v1 = {
      entries: [
        { id: '1', photoUri: 'file:///x/files/fotos/anotacoes/1.jpg' },
        { id: '2', photoUri: 'file:///estranho.jpg' },
        { id: '3' },
      ],
      photos: [
        { id: 'p1', uri: 'file:///x/files/fotos/caderno/2.jpg', date: '2026-11-01' },
        { id: 'p2', uri: 'content://algo', date: '2026-11-01' },
      ],
      fontSize: 'grande',
    };
    expect(migratePersisted(v1, 1)).toEqual({
      entries: [{ id: '1', photo: 'anotacoes/1.jpg' }, { id: '2' }, { id: '3' }],
      photos: [{ id: 'p1', file: 'caderno/2.jpg', date: '2026-11-01' }],
      fontSize: 'grande',
    });
  });

  it('não mexe em dados já na versão atual', () => {
    const v2 = { entries: [{ id: '1', photo: 'anotacoes/1.jpg' }], photos: [] };
    expect(migratePersisted(v2, 2)).toEqual(v2);
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
    expect(r.droppedPhotos).toBe(1);
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
  const base = { ...sample, cropUsage: { feijão: 3 }, lastAreaId: 'ex-canteiro-1' };

  it('mantém anotações reais feitas em áreas de exemplo', () => {
    const real = entry({ id: 'real', areaId: 'ex-roca-baixo', copied: false });
    const comFoto = { ...sample.entries[0], photo: 'anotacoes/ex.jpg' };
    const r = removeSampleData({ ...base, entries: [comFoto, ...sample.entries.slice(1), real] });
    expect(r.wasSampleProfile).toBe(true);
    expect(r.state.entries).toEqual([real]);
    expect(r.state.areas).toEqual([{ id: 'ex-roca-baixo', name: 'Roça de baixo' }]);
    expect(r.state.profile).toBeNull();
    expect(r.state.crops).toEqual(['feijão']);
    expect(r.state.lastAreaId).toBeUndefined();
    expect(r.removedPhotos).toEqual(['anotacoes/ex.jpg']);
  });

  it('com perfil real, só sai o que é de exemplo', () => {
    const r = removeSampleData({
      ...base,
      profile: { name: 'Ana' },
      areas: [...sample.areas, { id: 'minha', name: 'Quintal' }],
      entries: [...sample.entries, entry({ id: 'm', areaId: 'minha' })],
    });
    expect(r.wasSampleProfile).toBe(false);
    expect(r.state.profile).toEqual({ name: 'Ana' });
    expect(r.state.areas).toEqual([{ id: 'minha', name: 'Quintal' }]);
    expect(r.state.entries.map((e) => e.id)).toEqual(['m']);
    expect(r.state.cropUsage).toEqual({ feijão: 3 });
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
