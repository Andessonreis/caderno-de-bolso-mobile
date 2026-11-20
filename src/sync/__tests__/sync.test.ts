import type { Change } from '@/data/repository';
import { buildSampleData } from '@/lib/sample';
import type { Entry } from '@/lib/types';
import type { SyncConfig } from '@/store';

import { SyncApi, SyncError, type SyncResponse } from '../api';
import { type EngineDeps, type EngineState, backoffDelay, pendingCount, runSync } from '../engine';
import { syncLabel } from '../label';
import { buildLink, type Credentials, keyFromBytes, parseLink } from '../links';
import { contentTypeFor, localMediaPath, remoteMediaName } from '../media';
import { MAX_BATCH, type OutgoingRecord, type RemoteRecord, buildOutgoing, mergeRemote, toOutgoing } from '../records';

const T0 = '2026-11-01T10:00:00.000Z';
const T1 = '2026-11-02T10:00:00.000Z';
const T2 = '2026-11-03T10:00:00.000Z';
const CONTA = '3f1b2c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';
const CHAVE = keyFromBytes(new Uint8Array(32).fill(7));

let n = 0;
const nextId = () => `c${++n}`;

function entry(p: Partial<Entry> = {}): Entry {
  n += 1;
  return {
    id: `e${n}`,
    date: '2026-11-01',
    areaId: 'a1',
    crop: 'feijão',
    activity: 'colheita',
    quantity: 5,
    unit: 'kg',
    copied: false,
    createdAt: T0,
    updatedAt: T0,
    ...p,
  };
}

function change(entity: Change['entity'], recordId: string, op: Change['op'] = 'upsert'): Change {
  return { id: nextId(), entity, recordId, op, at: T0 };
}

function emptyState(p: Partial<EngineState> = {}): EngineState {
  const sync: SyncConfig = { ligado: true, perguntado: true, cursor: 0, enviados: {} };
  return {
    profile: null,
    areas: [],
    crops: [],
    entries: [],
    photos: [],
    peerVisits: [],
    manualChecks: {},
    pendingChanges: [],
    sync,
    ...p,
  };
}

describe('código para ligar outro celular', () => {
  it('faz ida e volta e aceita só o pedaço c=...&k=...', () => {
    const c: Credentials = { conta: CONTA, chave: CHAVE };
    const link = buildLink(c);
    expect(link).toBe(`cadernodebolso://ligar?c=${CONTA}&k=${CHAVE}`);
    expect(parseLink(link)).toEqual(c);
    expect(parseLink(`  c=${CONTA.toUpperCase()}&k=${CHAVE}\n`)).toEqual(c);
  });

  it('recusa código incompleto ou estranho', () => {
    expect(parseLink('cadernodebolso://ligar?c=abc&k=def')).toBeNull();
    expect(parseLink(`c=${CONTA}`)).toBeNull();
    expect(parseLink('qualquer coisa')).toBeNull();
  });

  it('chave com 32 bytes vira 43 caracteres base64url', () => {
    const k = keyFromBytes(Uint8Array.from({ length: 32 }, (_, i) => i * 7));
    expect(k).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(k).toBe(Buffer.from(Uint8Array.from({ length: 32 }, (_, i) => i * 7)).toString('base64url'));
  });
});

describe('nomes dos arquivos no servidor', () => {
  it('achata a pasta e volta', () => {
    expect(remoteMediaName('anotacoes/1732_ab12.jpg')).toBe('anotacoes-1732_ab12.jpg');
    expect(localMediaPath('anotacoes-1732_ab12.jpg')).toBe('anotacoes/1732_ab12.jpg');
    expect(localMediaPath('audios-1.m4a')).toBe('audios/1.m4a');
    expect(localMediaPath('estranho-1.jpg')).toBeNull();
  });

  it('tipos aceitos pelo servidor', () => {
    expect(contentTypeFor('anotacoes/1.jpg')).toBe('image/jpeg');
    expect(contentTypeFor('audios/1.m4a')).toBe('audio/mp4');
    expect(contentTypeFor('caderno/1.heic')).toBeNull();
  });
});

describe('frase do indicador', () => {
  const base = { available: true, ligado: true, fase: 'parado' as const, online: true, pending: 0, exemplo: false };
  it('cobre os estados', () => {
    expect(syncLabel(base).text).toBe('Tudo guardado na internet');
    expect(syncLabel({ ...base, pending: 3 }).text).toBe('Faltam 3 para enviar');
    expect(syncLabel({ ...base, fase: 'enviando' }).text).toBe('Enviando…');
    expect(syncLabel({ ...base, online: false, pending: 2 }).text).toBe('Sem internet: guardado só no celular, envio depois');
    expect(syncLabel({ ...base, ligado: false }).text).toBe('Guardado só neste celular');
    expect(syncLabel({ ...base, exemplo: true }).text).toBe('Guardado só neste celular');
    expect(syncLabel({ ...base, fase: 'chave' }).tone).toBe('aviso');
  });
});

describe('registros enviados', () => {
  it('mapeia cada tipo e deixa de fora exemplo e o que sumiu', () => {
    const e = entry({ photo: 'anotacoes/1.jpg' });
    const ex = entry({ exemplo: true });
    const st = emptyState({
      profile: { name: 'Ana', updatedAt: T1 },
      crops: ['feijão'],
      culturasUpdatedAt: T1,
      visitaUpdatedAt: T1,
      manualChecks: { notas: true },
      lastVisitDate: '2026-08-01',
      areas: [{ id: 'a1', name: 'Horta', updatedAt: T0 }],
      entries: [e, ex],
    });
    expect(toOutgoing(change('perfil', 'perfil'), st)).toEqual({
      tipo: 'perfil',
      id: 'perfil',
      dados: { name: 'Ana' },
      atualizado_em: T1,
      apagado_em: null,
    });
    expect(toOutgoing(change('culturas', 'culturas'), st)?.dados).toEqual({ lista: ['feijão'] });
    expect(toOutgoing(change('visita', 'visita'), st)?.dados).toEqual({ itens: { notas: true }, ultimaVisita: '2026-08-01' });
    expect(toOutgoing(change('area', 'a1'), st)?.dados).toEqual({ name: 'Horta' });
    const out = toOutgoing(change('anotacao', e.id), st);
    expect(out?.dados).not.toHaveProperty('id');
    expect(out?.dados).toMatchObject({ crop: 'feijão', photo: 'anotacoes/1.jpg', createdAt: T0 });
    expect(toOutgoing(change('anotacao', ex.id), st)).toBeNull();
    expect(toOutgoing(change('anotacao', 'nao-existe'), st)).toBeNull();
  });

  it('apagado vai com apagado_em', () => {
    const e = entry({ deletedAt: T1, updatedAt: T1 });
    const out = toOutgoing(change('anotacao', e.id, 'delete'), emptyState({ entries: [e] }));
    expect(out).toMatchObject({ apagado_em: T1, atualizado_em: T1 });
  });

  it('lotes de no máximo 200 e descarte do que não precisa ir', () => {
    const entries = Array.from({ length: 250 }, () => entry());
    const pendingChanges = [change('anotacao', 'sumiu'), ...entries.map((e) => change('anotacao', e.id))];
    const b = buildOutgoing(emptyState({ entries, pendingChanges }));
    expect(b.records).toHaveLength(MAX_BATCH);
    expect(b.changeIds).toHaveLength(MAX_BATCH);
    expect(b.dropped).toEqual([pendingChanges[0].id]);
  });

  it('registro grande demais não vai (e sai da fila)', () => {
    const big = entry({ note: 'x'.repeat(40_000) });
    const c = change('anotacao', big.id);
    const b = buildOutgoing(emptyState({ entries: [big], pendingChanges: [c] }));
    expect(b.records).toEqual([]);
    expect(b.dropped).toEqual([c.id]);
  });
});

function remote(tipo: string, id: string, dados: unknown, atualizado_em: string, apagado_em: string | null = null): RemoteRecord {
  return { tipo, id, dados, atualizado_em, apagado_em, seq: 1 };
}

describe('juntar o que veio do servidor', () => {
  it('vence a alteração mais recente', () => {
    const local = entry({ id: 'x', quantity: 5, updatedAt: T1 });
    const pending = change('anotacao', 'x');
    const st = emptyState({ entries: [local], pendingChanges: [pending] });

    const older = mergeRemote(st, [remote('anotacao', 'x', { ...local, quantity: 1 }, T0)]);
    expect(older.applied).toBe(0);
    expect(older.state.entries[0].quantity).toBe(5);
    expect(older.state.pendingChanges).toEqual([pending]);

    const newer = mergeRemote(st, [remote('anotacao', 'x', { ...local, quantity: 9 }, '2026-11-02T10:00:00.500+00:00')]);
    expect(newer.applied).toBe(1);
    expect(newer.state.entries[0]).toMatchObject({ quantity: 9, updatedAt: '2026-11-02T10:00:00.500+00:00' });
    // a alteração local perdeu: não precisa mais ir
    expect(newer.state.pendingChanges).toEqual([]);
  });

  it('traz registros novos, apagamentos e listas únicas', () => {
    const local = entry({ id: 'y' });
    const st = emptyState({ entries: [local], crops: ['milho'], culturasUpdatedAt: T0 });
    const r = mergeRemote(st, [
      remote('area', 'a9', { name: 'Quintal' }, T1),
      remote('anotacao', 'y', local, T2, T2),
      remote('culturas', 'culturas', { lista: ['feijão', 'alface'] }, T1),
      remote('visita', 'visita', { itens: { notas: true, hack: true }, ultimaVisita: '2026-09-01' }, T1),
      remote('perfil', 'perfil', { name: 'Ana', municipality: 'Irecê' }, T1),
      remote('pagina', 'p1', { file: 'caderno/1.jpg', date: '2026-11-01' }, T1),
    ]);
    expect(r.applied).toBe(6);
    expect(r.state.areas).toEqual([{ id: 'a9', name: 'Quintal', updatedAt: T1 }]);
    expect(r.state.entries[0].deletedAt).toBe(T2);
    expect(r.state.crops).toEqual(['feijão', 'alface']);
    expect(r.state.manualChecks).toEqual({ notas: true });
    expect(r.state.lastVisitDate).toBe('2026-09-01');
    expect(r.state.profile).toEqual({ name: 'Ana', municipality: 'Irecê', updatedAt: T1 });
    expect(r.state.photos[0]).toMatchObject({ id: 'p1', file: 'caderno/1.jpg' });
  });

  it('ignora registros inválidos ou de tipo desconhecido sem apagar nada', () => {
    const local = entry({ id: 'z' });
    const st = emptyState({ entries: [local] });
    const r = mergeRemote(st, [
      remote('anotacao', 'nova', { crop: '' }, T2),
      remote('pagina', 'p', { file: '../../etc/passwd', date: '2026-11-01' }, T2),
      remote('outro_tipo', 'q', {}, T2),
    ]);
    expect(r.applied).toBe(0);
    expect(r.state.entries).toEqual([local]);
    expect(r.state.photos).toEqual([]);
  });

  it('perfil de exemplo é substituído pelo do servidor', () => {
    const st = emptyState({ profile: { name: 'Zé', exemplo: true } });
    const r = mergeRemote(st, [remote('perfil', 'perfil', { name: 'Ana' }, T0)]);
    expect(r.state.profile).toEqual({ name: 'Ana', updatedAt: T0 });
  });
});

/** Servidor falso com as mesmas regras do real: última alteração vence e cursor por seq. */
class FakeServer {
  rows = new Map<string, RemoteRecord>();
  seq = 0;
  files = new Map<string, string>();
  chave = CHAVE;
  calls = 0;
  offline = false;

  api: EngineDeps['api'] = {
    criarConta: async () => CONTA,
    sincronizar: async (c, desde, mudancas: OutgoingRecord[]): Promise<SyncResponse> => {
      this.calls += 1;
      if (this.offline) throw new SyncError('rede', 'sem conexão');
      if (c.chave !== this.chave) throw new SyncError('chave', 'chave_nao_confere');
      for (const m of mudancas) {
        const key = `${m.tipo}:${m.id}`;
        const cur = this.rows.get(key);
        if (cur && Date.parse(m.atualizado_em) <= Date.parse(cur.atualizado_em)) continue;
        this.rows.set(key, { ...m, seq: ++this.seq });
      }
      const mudancasOut = [...this.rows.values()].filter((r) => r.seq > desde).sort((a, b) => a.seq - b.seq);
      return { seq: Math.max(desde, ...mudancasOut.map((r) => r.seq)), tem_mais: false, mudancas: mudancasOut };
    },
  };
}

/** Um "celular": estado em memória, arquivos em memória e chave guardada. */
function device(server: FakeServer, initial: Partial<EngineState> = {}, saved: Credentials | null = null) {
  let st = emptyState(initial);
  const files = new Set<string>();
  let cred = saved;
  const deps: EngineDeps = {
    api: server.api,
    store: { get: () => st, update: (fn) => (st = { ...st, ...fn(st) }) },
    credentials: {
      load: async () => cred,
      save: async (c) => {
        cred = c;
      },
      newKey: () => CHAVE,
    },
    media: {
      exists: (p) => files.has(p),
      upload: async (_c, p) => {
        if (server.offline) throw new SyncError('rede', 'sem conexão');
        server.files.set(p, 'conteúdo');
      },
      download: async (_c, p) => {
        if (!server.files.has(p)) throw new SyncError('servidor', '404');
        files.add(p);
      },
    },
  };
  return {
    deps,
    files,
    get state() {
      return st;
    },
    get cred() {
      return cred;
    },
    edit(fn: (s: EngineState) => Partial<EngineState>) {
      st = { ...st, ...fn(st) };
    },
  };
}

describe('motor de sincronização', () => {
  it('desligado não faz nada', async () => {
    const server = new FakeServer();
    const a = device(server, { sync: { ligado: false, perguntado: true, cursor: 0, enviados: {} } });
    await runSync(a.deps);
    expect(server.calls).toBe(0);
    expect(a.cred).toBeNull();
  });

  it('dois celulares chegam ao mesmo caderno, com fotos e recados', async () => {
    const server = new FakeServer();
    const e = entry({ id: 'e-a', photo: 'anotacoes/1.jpg', audio: 'audios/1.m4a', audioSeconds: 4 });
    const a = device(server, {
      profile: { name: 'Ana', updatedAt: T0 },
      areas: [{ id: 'a1', name: 'Horta', updatedAt: T0 }],
      entries: [e],
      pendingChanges: [change('perfil', 'perfil'), change('area', 'a1'), change('anotacao', 'e-a')],
    });
    a.files.add('anotacoes/1.jpg');
    a.files.add('audios/1.m4a');

    const outA = await runSync(a.deps);
    expect(a.cred).toEqual({ conta: CONTA, chave: CHAVE });
    expect(outA).toMatchObject({ sent: 3, uploaded: 2 });
    expect(a.state.pendingChanges).toEqual([]);
    expect(a.state.sync.enviados).toEqual({ 'anotacoes/1.jpg': true, 'audios/1.m4a': true });

    const b = device(server, {}, { conta: CONTA, chave: CHAVE });
    const outB = await runSync(b.deps);
    expect(outB).toMatchObject({ received: 3, downloaded: 2 });
    expect(b.state.profile?.name).toBe('Ana');
    expect(b.state.entries).toHaveLength(1);
    expect(b.files.has('audios/1.m4a')).toBe(true);

    // B muda a anotação; A recebe na próxima rodada.
    b.edit((s) => ({
      entries: s.entries.map((x) => ({ ...x, quantity: 7, updatedAt: T2 })),
      pendingChanges: [change('anotacao', 'e-a')],
    }));
    await runSync(b.deps);
    await runSync(a.deps);
    expect(a.state.entries[0].quantity).toBe(7);
  });

  it('repetir não reenvia nada (idempotente)', async () => {
    const server = new FakeServer();
    const a = device(server, { entries: [entry({ id: 'k' })], pendingChanges: [change('anotacao', 'k')] });
    await runSync(a.deps);
    const seq = server.seq;
    const out = await runSync(a.deps);
    expect(out).toEqual({ sent: 0, received: 0, uploaded: 0, downloaded: 0 });
    expect(server.seq).toBe(seq);
  });

  it('dados de exemplo nunca sobem', async () => {
    const server = new FakeServer();
    const sample = buildSampleData('2026-11-20');
    const a = device(server, { ...sample, pendingChanges: sample.entries.map((e) => change('anotacao', e.id)) });
    await runSync(a.deps);
    expect(server.rows.size).toBe(0);
    expect(a.state.pendingChanges).toEqual([]);
  });

  it('sem internet: erro de rede, fila e dados ficam intactos', async () => {
    const server = new FakeServer();
    server.offline = true;
    const e = entry({ id: 'off' });
    const pending = [change('anotacao', 'off')];
    const a = device(server, { entries: [e], pendingChanges: pending }, { conta: CONTA, chave: CHAVE });
    await expect(runSync(a.deps)).rejects.toMatchObject({ kind: 'rede' });
    expect(a.state.entries).toEqual([e]);
    expect(a.state.pendingChanges).toEqual(pending);
  });

  it('chave que não confere: para sem apagar nada', async () => {
    const server = new FakeServer();
    server.chave = 'outra';
    const e = entry({ id: 'ch' });
    const a = device(server, { entries: [e], pendingChanges: [change('anotacao', 'ch')] }, { conta: CONTA, chave: CHAVE });
    await expect(runSync(a.deps)).rejects.toMatchObject({ kind: 'chave' });
    expect(a.state.entries).toEqual([e]);
    expect(a.state.pendingChanges).toHaveLength(1);
  });

  it('conta o que falta enviar', () => {
    const st = emptyState({
      entries: [entry({ photo: 'anotacoes/9.jpg' })],
      pendingChanges: [change('anotacao', 'x')],
    });
    expect(pendingCount(st, () => true)).toBe(2);
    expect(pendingCount({ ...st, sync: { ...st.sync, enviados: { 'anotacoes/9.jpg': true } } }, () => true)).toBe(1);
  });

  it('recuo exponencial com teto', () => {
    expect(backoffDelay(1)).toBe(5_000);
    expect(backoffDelay(2)).toBe(10_000);
    expect(backoffDelay(4)).toBe(40_000);
    expect(backoffDelay(20)).toBe(300_000);
  });
});

describe('camada de rede (fetch falso)', () => {
  const config = { url: 'https://exemplo.supabase.co', key: 'pub_123' };

  it('manda os cabeçalhos e o corpo certos', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const api = new SyncApi(config, async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ seq: 5, tem_mais: false, mudancas: [] }), { status: 200 });
    });
    const res = await api.sincronizar({ conta: CONTA, chave: CHAVE }, 3, []);
    expect(res).toEqual({ seq: 5, tem_mais: false, mudancas: [] });
    expect(calls[0].url).toBe('https://exemplo.supabase.co/rest/v1/rpc/caderno_sincronizar');
    expect(calls[0].init?.headers).toMatchObject({ apikey: 'pub_123', Authorization: 'Bearer pub_123' });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ p_conta: CONTA, p_chave: CHAVE, p_desde: 3, p_mudancas: [] });
    expect(api.mediaHeaders({ conta: CONTA, chave: CHAVE })).toMatchObject({ 'x-caderno-chave': CHAVE });
    expect(api.mediaUrl({ conta: CONTA, chave: CHAVE }, 'audios-1.m4a')).toBe(
      `https://exemplo.supabase.co/storage/v1/object/caderno-midia/${CONTA}/audios-1.m4a`,
    );
  });

  it('traduz os erros', async () => {
    const chave = new SyncApi(config, async () =>
      new Response(JSON.stringify({ code: '28000', message: 'chave_nao_confere' }), { status: 401 }),
    );
    await expect(chave.sincronizar({ conta: CONTA, chave: CHAVE }, 0, [])).rejects.toMatchObject({ kind: 'chave' });
    const rede = new SyncApi(config, async () => {
      throw new TypeError('Network request failed');
    });
    await expect(rede.criarConta(CHAVE)).rejects.toMatchObject({ kind: 'rede' });
    const grande = new SyncApi(config, async () =>
      new Response(JSON.stringify({ code: '22023', message: 'registro_grande_demais' }), { status: 400 }),
    );
    await expect(grande.sincronizar({ conta: CONTA, chave: CHAVE }, 0, [])).rejects.toMatchObject({ kind: 'dados' });
  });
});
