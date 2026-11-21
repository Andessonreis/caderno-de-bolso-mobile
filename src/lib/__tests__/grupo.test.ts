import { exportSnapshot, useApp } from '@/store';
import { toOutgoing } from '@/sync/records';

import { buildArchive, readArchive } from '../archive';
import { parseBackup } from '../backup';
import {
  ALFABETO_GRUPO,
  codigoDoTexto,
  codigoValido,
  faltamParaGrupo,
  formatarCodigo,
  limparCodigo,
  linkDoGrupo,
  situacaoNoGrupo,
  visitasParaEnviar,
} from '../grupo';
import { migratePersisted } from '../migrate';
import { type Visita, novaVisita } from '../roteiro';

const T0 = '2026-11-01T10:00:00.000Z';
const T1 = '2026-11-02T10:00:00.000Z';

let n = 0;
function visita(p: Partial<Visita> = {}, nome = 'Maria'): Visita {
  n += 1;
  const v = novaVisita(new Date('2026-11-20T10:00:00'), `v${n}`);
  return { ...v, produtor: { ...v.produtor, nome }, updatedAt: T0, ...p };
}

describe('código do grupo', () => {
  it('limpa, confere e formata como XXXXX-XXXXX', () => {
    expect(limparCodigo(' abcde-23456 ')).toBe('ABCDE23456');
    expect(codigoValido('abcde 23456')).toBe(true);
    expect(codigoValido('ABCDE2345')).toBe(false);
    expect(codigoValido('ABCDE234567')).toBe(false);
    // I, L, O, 0 e 1 não existem no código: são fáceis de confundir.
    for (const c of ['I', 'L', 'O', '0', '1']) expect(codigoValido(`ABCD${c}23456`)).toBe(false);
    expect(ALFABETO_GRUPO).toHaveLength(31);
    expect(formatarCodigo('abcde23456')).toBe('ABCDE-23456');
    expect(formatarCodigo('abc')).toBe('ABC');
    expect(formatarCodigo('abcde2')).toBe('ABCDE-2');
    expect(formatarCodigo('ABCDE-23456-XYZ')).toBe('ABCDE-23456');
  });

  it('lê o link do QR ou só o código', () => {
    expect(linkDoGrupo('abcde23456')).toBe('cadernodebolso://grupo?c=ABCDE-23456');
    expect(codigoDoTexto('cadernodebolso://grupo?c=ABCDE-23456')).toBe('ABCDE23456');
    expect(codigoDoTexto('cadernodebolso://grupo?x=1&c=abcde23456')).toBe('ABCDE23456');
    expect(codigoDoTexto('  abcde-23456\n')).toBe('ABCDE23456');
    expect(codigoDoTexto('cadernodebolso://grupo?c=ABC')).toBeNull();
    expect(codigoDoTexto('cadernodebolso://grupo?c=%E0%A4%A')).toBeNull();
    expect(codigoDoTexto('https://exemplo.com/ABCDE23456')).toBeNull();
    expect(codigoDoTexto('cadernodebolso://ligar?k=ABCDE23456')).toBeNull();
    expect(codigoDoTexto('qualquer coisa')).toBeNull();
  });
});

describe('o que vai para o grupo', () => {
  it('envia visita com nome que mudou desde o último envio', () => {
    const nova = visita();
    const aceita = visita();
    const mudou = visita({ updatedAt: T1 });
    const enviadas = { [aceita.id]: T0, [mudou.id]: T0 };
    const sel = visitasParaEnviar([nova, aceita, mudou], enviadas);
    expect(sel.enviar.map((r) => r.id)).toEqual([nova.id, mudou.id]);
    expect(sel.enviar[0]).toEqual({
      id: nova.id,
      dados: expect.objectContaining({ produtor: nova.produtor, criadaEm: nova.criadaEm }),
      atualizado_em: T0,
      apagado_em: null,
    });
    expect(sel.enviar[0].dados).not.toHaveProperty('id');
    expect(sel.enviar[0].dados).not.toHaveProperty('updatedAt');
    expect(situacaoNoGrupo(aceita, enviadas)).toBe('enviada');
    expect(situacaoNoGrupo(mudou, enviadas)).toBe('falta');
  });

  it('rascunho sem o nome do produtor não vai; depois de ir, as mudanças vão', () => {
    const rascunho = visita({}, '  ');
    expect(visitasParaEnviar([rascunho], {}).enviar).toEqual([]);
    expect(situacaoNoGrupo(rascunho, {})).toBe('sem_nome');
    const apagouONome = visita({ updatedAt: T1 }, '');
    expect(visitasParaEnviar([apagouONome], { [apagouONome.id]: T0 }).enviar).toHaveLength(1);
  });

  it('exclusão vai sem os dados, só para visita que o grupo já tinha', () => {
    const jaFoi = visita({ deletedAt: T1, updatedAt: T1 });
    const nuncaFoi = visita({ deletedAt: T1, updatedAt: T1 });
    const enviadas = { [jaFoi.id]: T0 };
    const sel = visitasParaEnviar([jaFoi, nuncaFoi], enviadas);
    expect(sel.enviar).toEqual([{ id: jaFoi.id, dados: {}, atualizado_em: T1, apagado_em: T1 }]);
    expect(situacaoNoGrupo(nuncaFoi, enviadas)).toBe('fora');
    // Depois que o grupo aceitou a exclusão, não vai de novo.
    expect(visitasParaEnviar([jaFoi], { [jaFoi.id]: T1 }).enviar).toEqual([]);
  });

  it('visita grande demais fica de fora e é apontada, sem travar as outras', () => {
    const grande = visita({ observacoes: '…'.repeat(11_000) });
    const normal = visita();
    const sel = visitasParaEnviar([grande, normal], {});
    expect(sel.enviar.map((r) => r.id)).toEqual([normal.id]);
    expect(sel.grandes).toEqual([grande.id]);
    expect(situacaoNoGrupo(grande, {})).toBe('grande_demais');
    expect(faltamParaGrupo([grande, normal], {})).toBe(1);
  });
});

describe('grupo guardado no aparelho', () => {
  beforeEach(() => useApp.getState().resetAll());

  it('versão 5 → 6: começa sem grupo, sem mexer no resto', () => {
    const v5 = { entries: [{ id: '1' }], photos: [], peerVisits: [], pendingChanges: [] };
    expect(migratePersisted(v5, 5)).toEqual({ ...v5, grupo: null, grupoEnviadas: {} });
  });

  it('entrar, registrar o que o grupo aceitou e sair', () => {
    const v = visita();
    useApp.getState().savePeerVisit(v);
    const salva = useApp.getState().peerVisits[0];
    useApp.getState().joinGroup('ABCDE23456', 'Núcleo Pé de Serra');
    expect(useApp.getState().grupo).toMatchObject({ codigo: 'ABCDE23456', nome: 'Núcleo Pé de Serra' });

    useApp.getState().markSentToGroup('ABCDE23456', [{ id: salva.id, dados: {}, atualizado_em: salva.updatedAt, apagado_em: null }]);
    expect(useApp.getState().grupoEnviadas).toEqual({ [salva.id]: salva.updatedAt });
    // Resposta de outro grupo (trocou de código no meio do envio) não vale.
    useApp.getState().markSentToGroup('XYZWV23456', [{ id: 'outra', dados: {}, atualizado_em: T1, apagado_em: null }]);
    expect(useApp.getState().grupoEnviadas).not.toHaveProperty('outra');

    // Digitar o mesmo código de novo não esquece o que já foi.
    useApp.getState().joinGroup('ABCDE23456', 'Núcleo Pé de Serra');
    expect(useApp.getState().grupoEnviadas).toHaveProperty(salva.id);

    useApp.getState().leaveGroup();
    expect(useApp.getState().grupo).toBeNull();
    expect(useApp.getState().grupoEnviadas).toEqual({});
    // As visitas continuam no celular.
    expect(useApp.getState().peerVisits).toHaveLength(1);
  });

  it('o código vai na cópia de segurança e volta; não vai na cópia na internet', () => {
    useApp.getState().completeOnboarding({ name: 'Ana' }, [], []);
    useApp.getState().joinGroup('ABCDE23456', 'Núcleo Pé de Serra');
    const data = exportSnapshot(useApp.getState(), T1);
    const back = readArchive(buildArchive(data, []));
    if (!back) throw new Error('zip ilegível');
    const r = parseBackup(back.json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.grupo).toEqual(useApp.getState().grupo);

    // Nenhum registro da cópia na internet leva o código.
    const st = useApp.getState();
    const registros = st.pendingChanges.map((c) => JSON.stringify(toOutgoing(c, st)));
    expect(registros.length).toBeGreaterThan(0);
    expect(registros.join('')).not.toContain('ABCDE23456');

    useApp.getState().resetAll();
    useApp.getState().importData(r.data);
    expect(useApp.getState().grupo).toMatchObject({ codigo: 'ABCDE23456', nome: 'Núcleo Pé de Serra' });
  });

  it('arquivo sem o campo mantém o grupo do aparelho; grupo estragado é ignorado', () => {
    useApp.getState().joinGroup('ABCDE23456', 'Núcleo');
    useApp.getState().markSentToGroup('ABCDE23456', [{ id: 'v', dados: {}, atualizado_em: T0, apagado_em: null }]);
    const { grupo: _semGrupo, ...antigo } = exportSnapshot(useApp.getState(), T1);
    const r = parseBackup(JSON.stringify(antigo));
    if (!r.ok) throw new Error('arquivo recusado');
    expect(r.data).not.toHaveProperty('grupo');
    useApp.getState().importData(r.data);
    expect(useApp.getState().grupo?.codigo).toBe('ABCDE23456');
    expect(useApp.getState().grupoEnviadas).toEqual({ v: T0 });

    const estragado = parseBackup(JSON.stringify({ ...antigo, grupo: { codigo: 'ERRADO', nome: 'x' } }));
    expect(estragado.ok && estragado.data).not.toHaveProperty('grupo');

    // Arquivo de outro grupo: o que o grupo anterior aceitou não vale para ele.
    const outro = parseBackup(JSON.stringify({ ...antigo, grupo: { codigo: 'xyzwv-23456', nome: 'Outro', ligadoEm: T0 } }));
    if (!outro.ok) throw new Error('arquivo recusado');
    useApp.getState().importData(outro.data);
    expect(useApp.getState().grupo).toEqual({ codigo: 'XYZWV23456', nome: 'Outro', ligadoEm: T0 });
    expect(useApp.getState().grupoEnviadas).toEqual({});

    // Arquivo feito sem grupo: sai do grupo.
    const semGrupo = parseBackup(JSON.stringify({ ...antigo, grupo: null }));
    if (!semGrupo.ok) throw new Error('arquivo recusado');
    useApp.getState().importData(semGrupo.data);
    expect(useApp.getState().grupo).toBeNull();
  });
});
