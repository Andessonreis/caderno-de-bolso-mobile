import {
  MAX_RECORD_BYTES,
  buildOutgoing,
  mergeRemote,
  toOutgoing,
  type SyncedState,
  visitaGrandeDemais,
} from '@/sync/records';
import { exportSnapshot, useApp } from '@/store';

import { parseBackup } from '../backup';
import { migratePersisted } from '../migrate';
import { ITENS, LIMITES_VISITA, bytesUtf8, normalizarVisita, novaVisita, type Visita } from '../roteiro';

const T0 = '2026-11-01T10:00:00.000Z';
const T1 = '2026-11-02T10:00:00.000Z';
const ID = '3f1b2c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';
const MUDANCA = { id: 'c1', entity: 'visita_par' as const, recordId: ID, op: 'upsert' as const, at: T0 };

function visita(p: Partial<Visita> = {}): Visita {
  const v = novaVisita(new Date('2026-11-20T10:00:00'), ID);
  return { ...v, produtor: { nome: 'Maria', municipio: 'Irecê', culturas: ['milho'] }, updatedAt: T0, ...p };
}

function estado(p: Partial<SyncedState> = {}): SyncedState {
  const vazio = { profile: null, areas: [], crops: [], entries: [], photos: [], peerVisits: [], manualChecks: {} };
  return { ...vazio, pendingChanges: [], ...p };
}

/** Visita com todos os textos no limite em letras, feitos de `trecho` repetido. */
function visitaNoLimite(trecho = 'ção\n"'): Visita {
  const longo = (n: number) => Array.from(trecho.repeat(n)).slice(0, n).join('');
  const v = visita({
    produtor: { nome: longo(LIMITES_VISITA.nome), municipio: longo(LIMITES_VISITA.municipio), culturas: [] },
    visitantes: longo(LIMITES_VISITA.visitantes),
    separacao: longo(LIMITES_VISITA.textoLongo),
    pontosFortes: longo(LIMITES_VISITA.textoLongo),
    observacoes: longo(LIMITES_VISITA.textoLongo),
    naoConformidades: Array.from({ length: LIMITES_VISITA.naoConformidades }, (_, i) => ({
      id: `n${i}`,
      descricao: longo(LIMITES_VISITA.naoConformidade),
      prazo: '2026-12-20',
    })),
  });
  v.produtor.culturas = Array.from({ length: LIMITES_VISITA.culturas }, () => longo(LIMITES_VISITA.cultura));
  for (const item of ITENS) v.respostas[item.id] = { r: 'parte', obs: longo(LIMITES_VISITA.observacao) };
  return v;
}

describe('visitas guardadas no aparelho', () => {
  it('versão 4 → 5: entra a lista de visitas vazia, sem mexer no resto', () => {
    const v4 = { entries: [{ id: '1' }], photos: [], pendingChanges: [] };
    expect(migratePersisted(v4, 4)).toEqual({ ...v4, peerVisits: [] });
  });

  it('versão 4 → 5: a cópia na internet volta a receber desde o começo, para trazer as visitas', () => {
    const sync = { ligado: true, perguntado: true, cursor: 42, enviados: { 'anotacoes/1.jpg': true } };
    const v4 = { entries: [], photos: [], pendingChanges: [], sync };
    expect(migratePersisted(v4, 4)).toEqual({ ...v4, peerVisits: [], sync: { ...sync, cursor: 0 } });
    // Já na versão 5, o cursor fica como está.
    expect(migratePersisted({ ...v4, peerVisits: [] }, 5)).toMatchObject({ sync: { cursor: 42 } });
  });

  it('receber de novo as visitas que já estão aqui não muda nada', () => {
    const v = visita({ parecer: 'conforme' });
    const out = toOutgoing(MUDANCA, estado({ peerVisits: [v] }));
    const remoto = { ...out!, seq: 1 };
    const primeira = mergeRemote(estado(), [remoto]);
    const segunda = mergeRemote(primeira.state, [remoto]);
    expect(segunda.applied).toBe(0);
    expect(segunda.state.peerVisits).toEqual(primeira.state.peerVisits);
  });

  it('salvar, apagar e desfazer passam pela fila de envio', () => {
    useApp.getState().resetAll();
    const v = visita();
    useApp.getState().savePeerVisit(v);
    expect(useApp.getState().peerVisits).toHaveLength(1);
    expect(useApp.getState().pendingChanges.at(-1)).toMatchObject({ entity: 'visita_par', recordId: ID, op: 'upsert' });

    useApp.getState().savePeerVisit({ ...v, parecer: 'conforme' });
    expect(useApp.getState().peerVisits).toHaveLength(1);
    expect(useApp.getState().peerVisits[0].parecer).toBe('conforme');
    expect(useApp.getState().pendingChanges.filter((c) => c.entity === 'visita_par')).toHaveLength(1);

    expect(useApp.getState().deletePeerVisit(ID)?.parecer).toBe('conforme');
    expect(useApp.getState().peerVisits[0].deletedAt).toEqual(expect.any(String));
    expect(useApp.getState().pendingChanges.at(-1)).toMatchObject({ entity: 'visita_par', op: 'delete' });

    useApp.getState().restorePeerVisit(ID);
    expect(useApp.getState().peerVisits[0].deletedAt).toBeUndefined();
    expect(useApp.getState().pendingChanges.at(-1)).toMatchObject({ entity: 'visita_par', op: 'upsert' });
  });
});

describe('cópia de segurança com visitas', () => {
  it('vai no arquivo e volta igual', () => {
    useApp.getState().resetAll();
    useApp.getState().savePeerVisit(visita({ observacoes: 'Linha 1\nLinha 2' }));
    const data = exportSnapshot(useApp.getState(), T1);
    const r = parseBackup(JSON.stringify(data));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.peerVisits).toEqual(useApp.getState().peerVisits);
  });

  it('arquivo antigo, sem visitas, não apaga as visitas do aparelho', () => {
    useApp.getState().resetAll();
    useApp.getState().savePeerVisit(visita());
    const { peerVisits: _semVisitas, ...antigo } = exportSnapshot(useApp.getState(), T1);
    const r = parseBackup(JSON.stringify(antigo));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.peerVisits).toBeUndefined();
    useApp.getState().importData(r.data);
    expect(useApp.getState().peerVisits).toHaveLength(1);
    expect(useApp.getState().pendingChanges.some((c) => c.entity === 'visita_par')).toBe(true);
  });

  it('limpa visitas estragadas e ignora campo de visitas que não é lista', () => {
    const base = exportSnapshot({ ...useApp.getState(), peerVisits: [] }, T1);
    const r = parseBackup(JSON.stringify({ ...base, peerVisits: [null, { semId: true }, { ...visita(), tipo: 'x' }] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.peerVisits?.map((v) => [v.id, v.tipo])).toEqual([[ID, '']]);
    for (const estragado of ['nada', 5, { a: 1 }, null]) {
      const ruim = parseBackup(JSON.stringify({ ...base, peerVisits: estragado }));
      expect(ruim.ok).toBe(true);
      if (ruim.ok) expect(ruim.data.peerVisits).toBeUndefined();
    }
  });
});

describe('visitas na cópia na internet', () => {
  it('vira registro do tipo visita_par sem os campos de controle', () => {
    const v = visita();
    const out = toOutgoing(MUDANCA, estado({ peerVisits: [v] }));
    expect(out).toMatchObject({ tipo: 'visita_par', id: ID, atualizado_em: T0, apagado_em: null });
    expect(out?.dados).not.toHaveProperty('id');
    expect(out?.dados).not.toHaveProperty('updatedAt');
    expect(out?.dados).toMatchObject({ produtor: { nome: 'Maria' }, data: '2026-11-20' });
    expect(out?.tipo).toMatch(/^[a-z_]{1,24}$/);
  });

  it('a maior visita possível cabe num registro', () => {
    const v = visitaNoLimite();
    const b = buildOutgoing(estado({ peerVisits: [v], pendingChanges: [MUDANCA] }));
    expect(b.records).toHaveLength(1);
    const json = JSON.stringify(b.records[0]);
    expect(Buffer.byteLength(json, 'utf8')).toBeLessThan(MAX_RECORD_BYTES);
  });

  it('a maior visita possível cabe mesmo cheia de "…", "—" e emoji', () => {
    for (const trecho of ['…', '—', '🌽', '🫘—…"\n', '👩🏽‍🌾']) {
      const v = normalizarVisita(visitaNoLimite(trecho), T0)!;
      const ids = Array.from({ length: LIMITES_VISITA.naoConformidades }, (_, i) => `${'🌽'.repeat(60)}${i}`);
      const crua = { ...v, id: ID, naoConformidades: v.naoConformidades.map((n, i) => ({ ...n, id: ids[i] })) };
      const maior = normalizarVisita(crua, T0)!;
      expect(visitaGrandeDemais(maior)).toBe(false);
      const b = buildOutgoing(estado({ peerVisits: [maior], pendingChanges: [MUDANCA] }));
      expect(b.records).toHaveLength(1);
      const bytes = Buffer.byteLength(JSON.stringify(b.records[0]), 'utf8');
      expect(bytesUtf8(JSON.stringify(b.records[0]))).toBe(bytes);
      expect(bytes).toBeLessThan(MAX_RECORD_BYTES);
    }
  });

  it('visita que mesmo assim passar do limite fica na fila e é apontada como grande demais', () => {
    const v = visita({ observacoes: '…'.repeat(11_000) });
    expect(visitaGrandeDemais(v)).toBe(true);
    const b = buildOutgoing(estado({ peerVisits: [v], pendingChanges: [MUDANCA] }));
    expect(b.records).toEqual([]);
    expect(b.dropped).toEqual([]);
    expect(b.tooBig).toEqual([MUDANCA.id]);
    expect(visitaGrandeDemais({ ...v, deletedAt: T1 })).toBe(false);
  });

  it('visita apagada sobe sem os dados do produtor visitado', () => {
    const v = visita({ observacoes: 'Nada a declarar', deletedAt: T1, updatedAt: T1 });
    const out = toOutgoing({ ...MUDANCA, op: 'delete' }, estado({ peerVisits: [v] }));
    expect(out).toEqual({ tipo: 'visita_par', id: ID, dados: {}, atualizado_em: T1, apagado_em: T1 });

    // No outro celular, o apagamento sem dados só marca a visita que já estava lá.
    const outro = mergeRemote(estado({ peerVisits: [visita()] }), [{ ...out!, seq: 2 }]);
    expect(outro.state.peerVisits[0]).toMatchObject({ produtor: { nome: 'Maria' }, deletedAt: T1, updatedAt: T1 });
    const novo = mergeRemote(estado(), [{ ...out!, seq: 2 }]);
    expect(novo.state.peerVisits[0]).toMatchObject({ id: ID, deletedAt: T1 });
  });

  it('ida e volta entre dois celulares, com apagamento e a mais recente vencendo', () => {
    const v = visita({ parecer: 'pendencias' });
    const out = toOutgoing(MUDANCA, estado({ peerVisits: [v] }));
    const remoto = { ...out!, seq: 1 };

    const outro = mergeRemote(estado(), [remoto]);
    expect(outro.applied).toBe(1);
    expect(outro.state.peerVisits).toEqual([v]);

    const maisNova = visita({ parecer: 'conforme', updatedAt: T1 });
    const naoTroca = mergeRemote(estado({ peerVisits: [maisNova] }), [remoto]);
    expect(naoTroca.applied).toBe(0);
    expect(naoTroca.state.peerVisits[0].parecer).toBe('conforme');

    const apagada = mergeRemote(estado({ peerVisits: [v] }), [{ ...remoto, atualizado_em: T1, apagado_em: T1 }]);
    expect(apagada.state.peerVisits[0]).toMatchObject({ id: ID, deletedAt: T1, updatedAt: T1 });
  });

  it('ignora visita estragada vinda do servidor', () => {
    const estragada = { tipo: 'visita_par', id: '', dados: {}, atualizado_em: T1, apagado_em: null, seq: 1 };
    const r = mergeRemote(estado(), [estragada]);
    expect(r.applied).toBe(0);
    expect(r.state.peerVisits).toEqual([]);
  });
});
