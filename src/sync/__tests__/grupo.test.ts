import type { VisitaParaGrupo } from '@/lib/grupo';
import { type Visita, novaVisita } from '@/lib/roteiro';
import { useApp } from '@/store';

import { REQUEST_TIMEOUT_MS, SyncApi } from '../api';
import { type GroupDeps, type GroupState, runGroupSend } from '../grupo';
import { groupLabel } from '../label';
import {
  checkGroup,
  enterGroup,
  leaveGroup,
  requestGroupSend,
  retryGroupSend,
  sendToGroupNow,
  syncNow,
  useGroupStatus,
  useSyncStatus,
} from '../service';

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
  /** Bytes por visita que o servidor aceita (o de verdade mede como jsonb, não como texto). */
  maxBytes = 32_768;
  /** Visitas que o grupo guarda; passar disso com visita nova dá "limite_de_registros". */
  maxVisitas = 5000;
  /** Ids que o servidor recusa como estragados. */
  estragadas = new Set<string>();

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
    if (body.p_visitas.some((v) => new TextEncoder().encode(JSON.stringify(v)).length > this.maxBytes)) {
      return new Response(JSON.stringify({ code: '22023', message: 'registro_grande_demais' }), { status: 400 });
    }
    if (body.p_visitas.some((v) => this.estragadas.has(v.id))) {
      return new Response(JSON.stringify({ code: '22023', message: 'visitas_invalidas' }), { status: 400 });
    }
    // O lote inteiro volta atrás quando traz visita nova e passa do limite.
    const novas = new Set(body.p_visitas.filter((v) => !this.rows.has(v.id)).map((v) => v.id));
    if (novas.size > 0 && this.rows.size + novas.size > this.maxVisitas) {
      return new Response(JSON.stringify({ code: '54000', message: 'limite_de_registros' }), { status: 400 });
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
    grupoRecusadas: {},
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
      markRejected: (codigo, rejected) => {
        if (state.grupo?.codigo !== codigo) return;
        for (const r of rejected) state.grupoRecusadas = { ...state.grupoRecusadas, [r.id]: r.atualizado_em };
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
    expect(out).toEqual({ sent: 1, tooBig: 1, rejected: 0, full: false });
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

  it('lote recusado vai visita por visita: a recusada fica de fora até mudar, sem travar as outras', async () => {
    const server = new FakeGroupServer();
    const [boa1, ruim, boa2] = [visita(), visita(), visita()];
    server.estragadas.add(ruim.id);
    const a = device(server, { peerVisits: [boa1, ruim, boa2] });
    const out = await runGroupSend(a.deps);
    expect(out).toEqual({ sent: 2, tooBig: 0, rejected: 1, full: false });
    // O lote de 3 voltou; depois foram 3 envios de uma visita (só os aceitos contam).
    expect(server.lotes).toEqual([1, 1]);
    expect([...server.rows.keys()].sort()).toEqual([boa1.id, boa2.id].sort());
    expect(a.state.grupoRecusadas).toEqual({ [ruim.id]: T0 });

    // Rodadas seguintes não insistem na versão recusada.
    const chamadas = jest.fn(server.fetch);
    a.deps.api = new SyncApi(CONFIG, chamadas);
    expect(await runGroupSend(a.deps)).toEqual({ sent: 0, tooBig: 0, rejected: 1, full: false });
    expect(chamadas).not.toHaveBeenCalled();

    // A visita mudou: vai de novo, e a marca de recusada sai quando o grupo aceita.
    server.estragadas.clear();
    a.state.peerVisits = [boa1, { ...ruim, observacoes: 'arrumada', updatedAt: T1 }, boa2];
    await runGroupSend(a.deps);
    expect(server.rows.has(ruim.id)).toBe(true);
    expect(a.state.grupoEnviadas[ruim.id]).toBe(T1);
  });

  it('visita que o app achou pequena e o servidor recusou por tamanho fica de fora sozinha', async () => {
    const server = new FakeGroupServer();
    // O servidor mede diferente do app: aqui ele aceita bem menos do que a folga do app.
    server.maxBytes = 4_000;
    const media = visita({ observacoes: 'x'.repeat(6_000) });
    const outras = Array.from({ length: 4 }, () => visita());
    const a = device(server, { peerVisits: [outras[0], media, ...outras.slice(1)] });
    const out = await runGroupSend(a.deps);
    expect(out).toMatchObject({ sent: 4, tooBig: 0, rejected: 1 });
    expect(server.rows.has(media.id)).toBe(false);
    expect(a.state.grupoRecusadas).toHaveProperty(media.id);
    expect(Object.keys(a.state.grupoEnviadas)).toHaveLength(4);
  });

  it('grupo cheio: visita nova para, correção e exclusão do que o grupo já tem continuam indo', async () => {
    const server = new FakeGroupServer();
    server.maxVisitas = 2;
    const [v1, v2] = [visita(), visita()];
    const a = device(server, { peerVisits: [v1, v2] });
    await runGroupSend(a.deps);

    const nova = visita();
    a.state.peerVisits = [{ ...v1, parecer: 'conforme', updatedAt: T1 }, { ...v2, deletedAt: T1, updatedAt: T1 }, nova];
    const out = await runGroupSend(a.deps);
    expect(out).toEqual({ sent: 2, tooBig: 0, rejected: 0, full: true });
    expect(server.rows.get(v1.id)?.dados).toMatchObject({ parecer: 'conforme' });
    expect(server.rows.get(v2.id)?.apagado_em).toBe(T1);
    expect(server.rows.has(nova.id)).toBe(false);
    expect(a.state.grupoEnviadas).not.toHaveProperty(nova.id);

    // Rodada automática com o grupo cheio não manda a visita nova.
    const chamadas = jest.fn(server.fetch);
    a.deps.api = new SyncApi(CONFIG, chamadas);
    expect(await runGroupSend(a.deps, { full: true })).toMatchObject({ sent: 0, full: true });
    expect(chamadas).not.toHaveBeenCalled();

    // "Tentar de novo" depois que a coordenação abriu espaço: vai.
    server.maxVisitas = 5000;
    expect(await runGroupSend(a.deps)).toMatchObject({ sent: 1, full: false });
    expect(server.rows.has(nova.id)).toBe(true);
  });

  it('código que a chave do app não abre (401 sem grupo_nao_encontrado) não vira "grupo não encontrado"', async () => {
    const api = new SyncApi(CONFIG, async () =>
      new Response(JSON.stringify({ message: 'Invalid API key' }), { status: 401 }),
    );
    await expect(api.grupoEnviar(CODIGO, [])).rejects.toMatchObject({ kind: 'servidor', status: 401 });
    await expect(api.grupoConferir(CODIGO)).rejects.toMatchObject({ kind: 'servidor' });
    const nao = new SyncApi(CONFIG, async () =>
      new Response(JSON.stringify({ code: '28000', message: 'grupo_nao_encontrado' }), { status: 403 }),
    );
    await expect(nao.grupoConferir(CODIGO)).rejects.toMatchObject({ kind: 'chave', serverMessage: 'grupo_nao_encontrado' });
  });

  it('chamada sem resposta é cancelada no prazo e conta como sem internet', async () => {
    let signal: AbortSignal | null | undefined;
    // Servidor que nunca responde e ignora o cancelamento.
    const api = new SyncApi(
      CONFIG,
      (_url, init) => {
        signal = init?.signal;
        return new Promise<Response>(() => undefined);
      },
      20,
    );
    await expect(api.grupoEnviar(CODIGO, [])).rejects.toMatchObject({ kind: 'rede' });
    expect(signal?.aborted).toBe(true);
    expect(REQUEST_TIMEOUT_MS).toBe(30_000);
  });
});

describe('envio para o grupo no app', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    leaveGroup();
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
    jest.useFakeTimers();
    try {
      const presa = syncNow();
      await sendToGroupNow();
      expect(server.rows.size).toBe(1);
      // No prazo, a cópia presa desiste e conta como sem internet.
      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      await presa;
      expect(useSyncStatus.getState().fase).toBe('sem_internet');
    } finally {
      jest.useRealTimers();
      useSyncStatus.setState({ fase: 'parado' });
    }
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

  it('grupo cheio: fica "cheio" e só volta a tentar visita nova com "Tentar de novo"', async () => {
    const server = new FakeGroupServer();
    server.maxVisitas = 0;
    prepare(server, false);
    await sendToGroupNow();
    expect(useGroupStatus.getState().fase).toBe('cheio');
    expect(server.rows.size).toBe(0);

    // Uma rodada automática (visita salva, internet de volta) não insiste na visita nova.
    server.maxVisitas = 5000;
    await sendToGroupNow();
    expect(useGroupStatus.getState().fase).toBe('cheio');
    expect(server.rows.size).toBe(0);

    await retryGroupSend();
    expect(useGroupStatus.getState().fase).toBe('parado');
    expect(server.rows.size).toBe(1);
  });

  it('visita apagada fora do grupo: ao voltar para o mesmo grupo, a exclusão vai', async () => {
    const server = new FakeGroupServer();
    prepare(server, false);
    await sendToGroupNow();
    const [v] = useApp.getState().peerVisits;
    expect(server.rows.get(v.id)?.apagado_em).toBeNull();

    leaveGroup();
    useApp.getState().deletePeerVisit(v.id);
    enterGroup(CODIGO, 'Núcleo');
    await sendToGroupNow();
    expect(server.rows.get(v.id)?.apagado_em).toEqual(expect.any(String));
    expect(server.rows.get(v.id)?.dados).toEqual({});

    // Outro grupo começa do zero: o que o anterior aceitou não vale para ele.
    useApp.getState().joinGroup('XYZWV23456', 'Outro');
    expect(useApp.getState().grupoEnviadas).toEqual({});
    expect(useApp.getState().grupoEnviadasDe).toBe('XYZWV23456');
  });

  it('chave do app recusada ao conferir o código: "não deu agora", não "grupo não encontrado"', async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ message: 'Invalid API key' }), { status: 401 }),
    ) as unknown as typeof fetch;
    expect(await checkGroup(CODIGO)).toEqual({ ok: false, motivo: 'erro' });
  });

  it('servidor que não responde não deixa o envio preso', async () => {
    const server = new FakeGroupServer();
    prepare(server, false);
    jest.useFakeTimers();
    try {
      global.fetch = jest.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
      const preso = sendToGroupNow();
      await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
      await preso;
      expect(useGroupStatus.getState().fase).toBe('sem_internet');
    } finally {
      jest.useRealTimers();
    }
    // A próxima rodada roda normalmente.
    global.fetch = jest.fn(server.fetch) as unknown as typeof fetch;
    await sendToGroupNow();
    expect(useGroupStatus.getState().fase).toBe('parado');
    expect(server.rows.size).toBe(1);
  });
});

describe('frase do grupo', () => {
  const base = { fase: 'parado' as const, online: true, faltam: 0, naoForam: 0, exemplo: false };
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

  it('nunca diz "Tudo enviado" com visita de fora ou envio fora do normal', () => {
    const tudo = 'Tudo enviado ao grupo';
    expect(groupLabel({ ...base, naoForam: 1 })).toMatchObject({ text: '1 visita não pôde ir para o grupo', tone: 'aviso' });
    expect(groupLabel({ ...base, naoForam: 2 }).text).toBe('2 visitas não puderam ir para o grupo');
    expect(groupLabel({ ...base, naoForam: 2, faltam: 1 }).text).toBe('Falta 1 para enviar. 2 visitas não puderam ir para o grupo.');
    expect(groupLabel({ ...base, fase: 'cheio' })).toMatchObject({
      text: 'O grupo está cheio. Avise quem coordena o grupo.',
      tone: 'aviso',
    });
    for (const fase of ['enviando', 'erro', 'sem_internet', 'nao_encontrado', 'cheio'] as const) {
      expect(groupLabel({ ...base, fase }).text).not.toBe(tudo);
    }
    expect(groupLabel({ ...base, fase: 'erro' }).text).toBe('Não deu para enviar agora. O app tenta de novo sozinho.');
  });
});
