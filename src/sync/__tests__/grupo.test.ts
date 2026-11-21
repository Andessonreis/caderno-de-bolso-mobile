import type { VisitaParaGrupo } from '@/lib/grupo';
import { type Visita, novaVisita } from '@/lib/roteiro';
import { useApp } from '@/store';

import { SyncApi } from '../api';
import { type GroupDeps, type GroupState, runGroupSend } from '../grupo';
import { groupLabel } from '../label';
import { requestGroupSend, sendToGroupNow, syncNow, useGroupStatus } from '../service';

const T0 = '2026-11-01T10:00:00.000Z';
const T1 = '2026-11-02T10:00:00.000Z';
const CODIGO = 'ABCDE23456';
const CONFIG = { url: 'https://exemplo.supabase.co', key: 'pub_123' };

let n = 0;
function visita(p: Partial<Visita> = {}, nome = 'Maria'): Visita {
  n += 1;
  const v = novaVisita(new Date('2026-11-20T10:00:00'), `v${n}`);
  return { ...v, produtor: { ...v.produtor, nome }, updatedAt: T0, ...p };
}

/** Servidor do grupo em memória, com as mesmas regras e respostas HTTP do de verdade. */
class FakeGroupServer {
  codigos = new Set([CODIGO]);
  rows = new Map<string, VisitaParaGrupo>();
  lotes: number[] = [];
  online = true;

  fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    if (!this.online) throw new TypeError('Network request failed');
    const body = JSON.parse(String(init?.body)) as { p_codigo: string; p_visitas: VisitaParaGrupo[] };
    if (!url.endsWith('/rest/v1/rpc/caderno_grupo_enviar')) return new Response('{}', { status: 404 });
    if (!this.codigos.has(body.p_codigo)) {
      return new Response(JSON.stringify({ code: '28000', message: 'grupo_nao_encontrado' }), { status: 401 });
    }
    if (body.p_visitas.length > 50) {
      return new Response(JSON.stringify({ code: '22023', message: 'visitas_invalidas' }), { status: 400 });
    }
    if (body.p_visitas.some((v) => new TextEncoder().encode(JSON.stringify(v)).length > 32_768)) {
      return new Response(JSON.stringify({ code: '22023', message: 'registro_grande_demais' }), { status: 400 });
    }
    for (const v of body.p_visitas) {
      const atual = this.rows.get(v.id);
      if (!atual || v.atualizado_em > atual.atualizado_em) this.rows.set(v.id, v);
    }
    this.lotes.push(body.p_visitas.length);
    return new Response(JSON.stringify({ recebidas: body.p_visitas.length }), { status: 200 });
  };
}

function device(server: FakeGroupServer, initial: Partial<GroupState> = {}) {
  const state: GroupState = {
    profile: { name: 'Ana' },
    peerVisits: [],
    grupo: { codigo: CODIGO, nome: 'Núcleo', ligadoEm: T0 },
    grupoEnviadas: {},
    ...initial,
  };
  const deps: GroupDeps = {
    api: new SyncApi(CONFIG, server.fetch),
    store: {
      get: () => state,
      markSent: (codigo, sent) => {
        if (state.grupo?.codigo !== codigo) return;
        for (const r of sent) state.grupoEnviadas = { ...state.grupoEnviadas, [r.id]: r.atualizado_em };
      },
    },
  };
  return { state, deps };
}

describe('envio das visitas para o grupo', () => {
  it('envia o que mudou, em lotes de no máximo 50, e repetir não reenvia', async () => {
    const server = new FakeGroupServer();
    const visitas = Array.from({ length: 120 }, () => visita());
    const a = device(server, { peerVisits: [...visitas, visita({}, '')] });
    const out = await runGroupSend(a.deps);
    expect(out.sent).toBe(120);
    expect(server.lotes).toEqual([50, 50, 20]);
    expect(server.rows.size).toBe(120);
    expect(Object.keys(a.state.grupoEnviadas)).toHaveLength(120);

    await runGroupSend(a.deps);
    expect(server.lotes).toHaveLength(3);

    a.state.peerVisits = a.state.peerVisits.map((v, i) => (i === 0 ? { ...v, parecer: 'conforme', updatedAt: T1 } : v));
    await runGroupSend(a.deps);
    expect(server.lotes.at(-1)).toBe(1);
    expect(server.rows.get(visitas[0].id)?.dados).toMatchObject({ parecer: 'conforme' });
  });

  it('exclusão de visita que o grupo já tinha vai sem os dados', async () => {
    const server = new FakeGroupServer();
    const v = visita();
    const a = device(server, { peerVisits: [v] });
    await runGroupSend(a.deps);
    a.state.peerVisits = [{ ...v, deletedAt: T1, updatedAt: T1 }];
    await runGroupSend(a.deps);
    expect(server.rows.get(v.id)).toEqual({ id: v.id, dados: {}, atualizado_em: T1, apagado_em: T1 });
    expect(a.state.grupoEnviadas[v.id]).toBe(T1);
  });

  it('grupo não encontrado: para sem apagar nada nem marcar como enviada', async () => {
    const server = new FakeGroupServer();
    server.codigos.clear();
    const v = visita();
    const a = device(server, { peerVisits: [v] });
    await expect(runGroupSend(a.deps)).rejects.toMatchObject({ kind: 'chave' });
    expect(a.state.peerVisits).toEqual([v]);
    expect(a.state.grupoEnviadas).toEqual({});
  });

  it('sem internet: erro de rede e nada muda', async () => {
    const server = new FakeGroupServer();
    server.online = false;
    const a = device(server, { peerVisits: [visita()] });
    await expect(runGroupSend(a.deps)).rejects.toMatchObject({ kind: 'rede' });
    expect(a.state.grupoEnviadas).toEqual({});
  });

  it('visita grande demais fica de fora sem travar as outras nem entrar em laço', async () => {
    const server = new FakeGroupServer();
    const grande = visita({ observacoes: '…'.repeat(11_000) });
    const pequena = visita();
    const a = device(server, { peerVisits: [grande, pequena] });
    const out = await runGroupSend(a.deps);
    expect(out).toEqual({ sent: 1, tooBig: 1 });
    expect([...server.rows.keys()]).toEqual([pequena.id]);
    await runGroupSend(a.deps);
    expect(server.lotes).toEqual([1]);

    a.state.peerVisits = [{ ...grande, observacoes: 'curta', updatedAt: T1 }, pequena];
    await runGroupSend(a.deps);
    expect(server.rows.has(grande.id)).toBe(true);
  });

  it('dados de exemplo e celular sem grupo não enviam', async () => {
    const server = new FakeGroupServer();
    await runGroupSend(device(server, { peerVisits: [visita()], profile: { name: 'Zé', exemplo: true } }).deps);
    await runGroupSend(device(server, { peerVisits: [visita()], grupo: null }).deps);
    expect(server.lotes).toEqual([]);
  });

  it('saiu do grupo durante o envio: a resposta não é registrada', async () => {
    const server = new FakeGroupServer();
    const a = device(server, { peerVisits: [visita()] });
    const original = server.fetch;
    server.fetch = async (url, init) => {
      a.state.grupo = null;
      return original(url, init);
    };
    a.deps.api = new SyncApi(CONFIG, server.fetch);
    await runGroupSend(a.deps);
    expect(a.state.grupoEnviadas).toEqual({});
  });
});

describe('envio para o grupo no app', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    useApp.getState().resetAll();
    useGroupStatus.setState({ fase: 'parado' });
  });

  function prepare(server: FakeGroupServer, ligado: boolean) {
    const calls: string[] = [];
    global.fetch = jest.fn((url: string, init?: RequestInit) => {
      calls.push(url);
      // A cópia na internet fica presa (servidor lento): o grupo não pode esperar por ela.
      if (url.includes('caderno_grupo_')) return server.fetch(url, init);
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;
    useApp.getState().resetAll();
    useApp.setState((st) => ({ hydrated: true, sync: { ...st.sync, ligado, perguntado: true } }));
    useApp.getState().completeOnboarding({ name: 'Ana' }, [], []);
    useApp.getState().savePeerVisit(visita());
    useApp.getState().joinGroup(CODIGO, 'Núcleo');
    return calls;
  }

  it('envia com a cópia na internet desligada', async () => {
    const server = new FakeGroupServer();
    const calls = prepare(server, false);
    await sendToGroupNow();
    expect(server.rows.size).toBe(1);
    expect(calls.every((u) => u.includes('caderno_grupo_enviar'))).toBe(true);
    expect(Object.keys(useApp.getState().grupoEnviadas)).toHaveLength(1);
    expect(useGroupStatus.getState().fase).toBe('parado');
  });

  it('não espera a cópia na internet, nem quando ela está presa', async () => {
    const server = new FakeGroupServer();
    prepare(server, true);
    void syncNow();
    await sendToGroupNow();
    expect(server.rows.size).toBe(1);
  });

  it('grupo não encontrado para o envio até entrar de novo', async () => {
    const server = new FakeGroupServer();
    server.codigos.clear();
    prepare(server, false);
    await sendToGroupNow();
    expect(useGroupStatus.getState().fase).toBe('nao_encontrado');
    expect(useApp.getState().grupo?.codigo).toBe(CODIGO);
    expect(useApp.getState().peerVisits).toHaveLength(1);
    server.codigos.add(CODIGO);
    requestGroupSend();
    await sendToGroupNow();
    expect(server.rows.size).toBe(0);
  });
});

describe('frase do grupo', () => {
  const base = { fase: 'parado' as const, online: true, faltam: 0, exemplo: false };
  it('cobre os estados', () => {
    expect(groupLabel(base).text).toBe('Tudo enviado ao grupo');
    expect(groupLabel({ ...base, online: false }).text).toBe('Tudo enviado ao grupo');
    expect(groupLabel({ ...base, faltam: 1 }).text).toBe('Falta 1 para enviar');
    expect(groupLabel({ ...base, faltam: 3 }).text).toBe('Faltam 3 para enviar');
    expect(groupLabel({ ...base, faltam: 3, online: false }).text).toBe('Sem internet: envio depois');
    expect(groupLabel({ ...base, faltam: 3, fase: 'enviando' }).text).toBe('Enviando ao grupo…');
    expect(groupLabel({ ...base, faltam: 3, fase: 'erro' }).tone).toBe('aviso');
    expect(groupLabel({ ...base, fase: 'nao_encontrado' }).tone).toBe('aviso');
    expect(groupLabel({ ...base, faltam: 3, exemplo: true }).text).toBe('Com os dados de exemplo, nada vai para o grupo');
  });
});
