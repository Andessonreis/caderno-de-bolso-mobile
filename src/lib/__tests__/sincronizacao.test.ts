import { acknowledge, enqueue, findLive, live, patchMany, softDelete, undelete, upsert } from '@/data/repository';

import { buildArchive, isZip, mediaPathsOf, readArchive } from '../archive';
import { BACKUP_VERSION, type BackupData, parseBackup } from '../backup';
import { isUuid, uuid } from '../ids';
import { isRelativeMediaPath, toRelativeMediaPath } from '../media';
import type { Area, Entry } from '../types';

const T0 = '2026-11-01T00:00:00.000Z';
const T1 = '2026-11-02T00:00:00.000Z';

function entry(p: Partial<Entry> = {}): Entry {
  return {
    id: uuid(),
    date: '2026-11-20',
    areaId: 'a1',
    crop: 'feijão',
    activity: 'colheita',
    quantity: 3,
    unit: 'kg',
    copied: false,
    createdAt: T0,
    updatedAt: T0,
    ...p,
  };
}

describe('ids', () => {
  it('gera UUID v4 válidos e diferentes', () => {
    const ids = new Set(Array.from({ length: 200 }, () => uuid()));
    expect(ids.size).toBe(200);
    expect([...ids].every(isUuid)).toBe(true);
    expect(uuid(() => new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000');
  });
});

describe('repositório e fila de alterações', () => {
  const a: Area = { id: 'a', name: 'Horta', updatedAt: T0 };

  it('upsert cria e atualiza marcando updatedAt', () => {
    let list = upsert([], a, T0);
    list = upsert(list, { ...a, name: 'Horta nova' }, T1);
    expect(list).toEqual([{ id: 'a', name: 'Horta nova', updatedAt: T1 }]);
  });

  it('soft delete guarda o registro com deletedAt e pode ser desfeito', () => {
    const deleted = softDelete([a], 'a', T1);
    expect(deleted[0]).toEqual({ ...a, deletedAt: T1, updatedAt: T1 });
    expect(live(deleted)).toEqual([]);
    expect(findLive(deleted, 'a')).toBeUndefined();
    const back = undelete(deleted, 'a', '2026-11-03T00:00:00.000Z');
    expect(back[0]).toEqual({ id: 'a', name: 'Horta', updatedAt: '2026-11-03T00:00:00.000Z' });
  });

  it('patchMany altera só os escolhidos', () => {
    const e1 = entry();
    const e2 = entry();
    const out = patchMany([e1, e2], new Set([e2.id]), { copied: true }, T1);
    expect(out[0]).toBe(e1);
    expect(out[1]).toMatchObject({ copied: true, updatedAt: T1 });
  });

  it('a fila guarda só a alteração mais recente de cada registro', () => {
    let n = 0;
    const id = () => `c${++n}`;
    let q = enqueue([], { entity: 'entry', recordId: 'x', op: 'upsert', at: T0 }, id);
    q = enqueue(q, { entity: 'area', recordId: 'x', op: 'upsert', at: T0 }, id);
    q = enqueue(q, { entity: 'entry', recordId: 'x', op: 'delete', at: T1 }, id);
    expect(q).toEqual([
      { id: 'c2', entity: 'area', recordId: 'x', op: 'upsert', at: T0 },
      { id: 'c3', entity: 'entry', recordId: 'x', op: 'delete', at: T1 },
    ]);
    expect(acknowledge(q, ['c2'])).toEqual([q[1]]);
  });
});

describe('mídia', () => {
  it('aceita só pastas conhecidas e nomes simples', () => {
    expect(isRelativeMediaPath('audios/1.m4a')).toBe(true);
    expect(isRelativeMediaPath('caderno/2.jpg')).toBe(true);
    expect(isRelativeMediaPath('outra/2.jpg')).toBe(false);
    expect(isRelativeMediaPath('audios/../../x')).toBe(false);
    expect(toRelativeMediaPath('audios/1.m4a')).toBe('audios/1.m4a');
  });
});

describe('cópia de segurança em um arquivo só (.zip)', () => {
  const comFoto = entry({ photo: 'anotacoes/1.jpg', audio: 'audios/1.m4a', audioSeconds: 12 });
  const apagada = entry({ photo: 'anotacoes/velha.jpg', deletedAt: T1 });
  const data: BackupData = {
    app: 'caderno-de-bolso',
    version: BACKUP_VERSION,
    exportedAt: T1,
    profile: { name: 'Ana', updatedAt: T0 },
    areas: [{ id: uuid(), name: 'Horta', updatedAt: T0 }],
    crops: ['feijão'],
    entries: [comFoto, apagada],
    photos: [{ id: uuid(), file: 'caderno/p.jpg', date: '2026-11-10', caption: 'outubro', updatedAt: T0 }],
    manualChecks: { notas: true },
    lastVisitDate: '2026-08-01',
  };
  data.entries = data.entries.map((e) => ({ ...e, areaId: data.areas[0].id }));

  it('lista só a mídia de registros ativos', () => {
    expect(mediaPathsOf(data).sort()).toEqual(['anotacoes/1.jpg', 'audios/1.m4a', 'caderno/p.jpg']);
  });

  it('faz ida e volta com dados, fotos e áudios', () => {
    const media = mediaPathsOf(data).map((path, i) => ({ path, bytes: new Uint8Array([i, 1, 2, 3, 255]) }));
    const zip = buildArchive(data, media);
    expect(isZip(zip)).toBe(true);
    const back = readArchive(zip);
    expect(back).not.toBeNull();
    if (!back) return;
    expect(back.media.map((m) => m.path).sort()).toEqual(mediaPathsOf(data).sort());
    expect(Array.from(back.media.find((m) => m.path === 'audios/1.m4a')?.bytes ?? [])).toEqual([1, 1, 2, 3, 255]);

    const inZip = new Set(back.media.map((m) => m.path));
    const r = parseBackup(back.json, (p) => inZip.has(p));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.legacy).toBe(false);
    expect(r.droppedMedia).toBe(1); // a foto da anotação apagada não foi junto
    expect(r.data.entries[0]).toEqual(comFoto.areaId === data.areas[0].id ? comFoto : { ...comFoto, areaId: data.areas[0].id });
    expect(r.data.entries[1].deletedAt).toBe(T1);
    expect(r.data.photos).toEqual(data.photos);
    expect(r.data.manualChecks).toEqual({ notas: true });
  });

  it('ignora arquivos fora das pastas do app dentro do zip', () => {
    const zip = buildArchive(data, [{ path: 'audios/1.m4a', bytes: new Uint8Array([1]) }]);
    const back = readArchive(zip);
    expect(back?.media.map((m) => m.path)).toEqual(['audios/1.m4a']);
  });

  it('recusa zip sem dados e arquivo que não é zip', () => {
    expect(readArchive(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(isZip(new Uint8Array([0x7b, 0x22]))).toBe(false);
  });

  it('descarta foto do caderno que não veio no arquivo', () => {
    const r = parseBackup(JSON.stringify(data), () => false);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.photos).toEqual([]);
      expect(r.data.entries[0].photo).toBeUndefined();
      expect(r.data.entries[0].audio).toBeUndefined();
    }
  });
});
