import { decodeFicha, encodeFicha, fichaPayloadFrom } from '../ficha';
import {
  ETAPAS,
  ITENS,
  LIMITES_VISITA,
  culturasSensiveisDe,
  hojeIso,
  itensDaEtapa,
  nomeDoArquivo,
  normalizarVisita,
  novaVisita,
  pendencias,
  progresso,
  type Visita,
} from '../roteiro';

const AGORA = new Date('2026-11-20T10:00:00');

function visitaCompleta(): Visita {
  const v = novaVisita(AGORA, 'v1');
  v.produtor.nome = 'Zé Carlos';
  v.tipo = 'pares';
  v.usoArmazenamento = 'exclusivo';
  v.parecer = 'conforme';
  for (const item of ITENS) v.respostas[item.id] = { r: 'sim', obs: '' };
  return v;
}

describe('modelo do roteiro', () => {
  it('tem itens com id único e etapa conhecida', () => {
    const ids = ITENS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const etapas = new Set(ETAPAS.map((e) => e.id));
    for (const item of ITENS) expect(etapas.has(item.etapa)).toBe(true);
  });

  it('começa com a data de hoje, sem respostas e com id estável', () => {
    const v = novaVisita(AGORA, 'x');
    expect(v.data).toBe('2026-11-20');
    expect(v.respostas).toEqual({});
    expect(v.updatedAt).toBe(v.criadaEm);
    expect(v.deletedAt).toBeUndefined();
    expect(hojeIso(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(novaVisita(AGORA).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('só mostra a comprovação de origem quando há cultura sensível', () => {
    const v = novaVisita(AGORA, 'x');
    const ids = () => itensDaEtapa(v, 'sementes').map((i) => i.id);
    expect(ids()).not.toContain('sem_comprovacao');
    v.culturasSensiveis = ['milho'];
    expect(ids()).toContain('sem_comprovacao');
  });

  it('só pergunta sobre a separação se o armazém for compartilhado', () => {
    const v = visitaCompleta();
    expect(pendencias(v)).toEqual([]);
    v.usoArmazenamento = 'compartilhado';
    const rotulos = pendencias(v).map((p) => p.rotulo);
    expect(rotulos).toContain('Como é feita e registrada a separação');
    expect(rotulos.some((r) => r.includes('separação do produto orgânico'))).toBe(false);
    v.separacao = 'Sacos marcados com fita verde e anotação no caderno.';
    v.respostas.col_separacao_ok = { obs: '' };
    expect(pendencias(v).map((p) => p.etapa)).toEqual(['colheita']);
  });

  it('reconhece culturas sensíveis com e sem acento', () => {
    expect(culturasSensiveisDe(['Milho crioulo', 'feijao de corda', 'abóbora'])).toEqual(['feijão', 'milho']);
    expect(culturasSensiveisDe(['ALGODÃO colorido', 'soja'])).toEqual(['algodão', 'soja']);
    expect(culturasSensiveisDe(['coentro'])).toEqual([]);
  });
});

describe('progresso', () => {
  it('vai de zero a completo', () => {
    const inicio = progresso(novaVisita(AGORA, 'x'));
    // A data já vem preenchida.
    expect(inicio.feitos).toBe(1);
    expect(inicio.total).toBeGreaterThan(10);

    const completa = visitaCompleta();
    const total = progresso(completa).total;
    expect(progresso(completa)).toEqual({ feitos: total, total, fracao: 1 });
  });

  it('conta itens condicionais quando aparecem', () => {
    const v = visitaCompleta();
    const antes = progresso(v).total;
    v.culturasSensiveis = ['feijão'];
    // A resposta já existia (visitaCompleta responde todos os itens).
    expect(progresso(v)).toMatchObject({ total: antes + 1, feitos: antes + 1 });
    delete v.respostas.sem_comprovacao;
    expect(progresso(v)).toMatchObject({ total: antes + 1, feitos: antes });
    expect(pendencias(v)).toEqual([
      { etapa: 'sementes', rotulo: ITENS.find((i) => i.id === 'sem_comprovacao')!.texto },
    ]);
  });

  it('lista pendências na ordem das etapas', () => {
    const etapas = pendencias(novaVisita(AGORA, 'x')).map((p) => ETAPAS.findIndex((e) => e.id === p.etapa));
    expect([...etapas].sort((a, b) => a - b)).toEqual(etapas);
  });
});

describe('visita vinda de fora', () => {
  it('limpa valores fora do esperado', () => {
    const v = normalizarVisita({
      id: 'x',
      tipo: 'inventado',
      parecer: 'talvez',
      data: 'ontem',
      culturasSensiveis: ['milho', 'trigo'],
      respostas: {
        doc_caderno: { r: 'sim', obs: 5 },
        item_falso: { r: 'sim' },
        doc_dtc: { r: '?' },
      },
      naoConformidades: [{ descricao: 'x', prazo: 'amanhã' }, 'lixo'],
    });
    expect(v).not.toBeNull();
    expect(v!.tipo).toBe('');
    expect(v!.parecer).toBe('');
    expect(v!.data).toBe('');
    expect(v!.culturasSensiveis).toEqual(['milho']);
    expect(v!.respostas).toEqual({ doc_caderno: { r: 'sim', obs: '' } });
    expect(v!.naoConformidades).toHaveLength(1);
    expect(v!.naoConformidades[0].prazo).toBe('');
  });

  it('recusa o que não tem id e mantém uma visita válida igual', () => {
    expect(normalizarVisita(null)).toBeNull();
    expect(normalizarVisita([])).toBeNull();
    expect(normalizarVisita({ produtor: { nome: 'Sem id' } })).toBeNull();
    const v = visitaCompleta();
    v.naoConformidades = [{ id: 'n1', descricao: 'Anotar caldas', prazo: '2026-12-20' }];
    v.observacoes = 'Linha 1\nLinha 2';
    expect(normalizarVisita(JSON.parse(JSON.stringify(v)))).toEqual(v);
    const apagada = { ...v, deletedAt: '2026-11-21T10:00:00.000Z' };
    expect(normalizarVisita(apagada)?.deletedAt).toBe(apagada.deletedAt);
  });

  it('corta textos longos nos limites', () => {
    const v = normalizarVisita({
      id: 'x',
      produtor: { nome: 'a'.repeat(500) },
      observacoes: 'b'.repeat(5000),
      naoConformidades: Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, descricao: 'c', prazo: '' })),
    });
    expect(v!.produtor.nome).toHaveLength(LIMITES_VISITA.nome);
    expect(v!.observacoes).toHaveLength(LIMITES_VISITA.textoLongo);
    expect(v!.naoConformidades).toHaveLength(LIMITES_VISITA.naoConformidades);
  });

  it('dá nome legível ao arquivo', () => {
    const v = visitaCompleta();
    v.produtor.nome = 'Zé Carlos da Conceição';
    expect(nomeDoArquivo(v)).toBe('visita-ze-carlos-da-conceicao-2026-11-20');
  });
});

describe('ficha lida pelo QR ou colada', () => {
  const payload = encodeFicha({ v: 1, n: 'Maria da Silva', m: 'Irecê', cu: ['milho crioulo', 'abóbora'] });

  it('aceita o link completo, só o código ou d=código', () => {
    for (const entrada of [
      `https://exemplo.github.io/caderno-de-bolso-web/ficha/#d=${payload}`,
      `  ${payload}  `,
      `d=${payload}`,
    ]) {
      const p = fichaPayloadFrom(entrada);
      expect(p).toBe(payload);
      expect(decodeFicha(p!)?.n).toBe('Maria da Silva');
    }
  });

  it('recusa o que não é ficha', () => {
    expect(fichaPayloadFrom('')).toBeNull();
    expect(fichaPayloadFrom('https://exemplo.com/#outra=1')).toBeNull();
    expect(fichaPayloadFrom('cadernodebolso://ligar?c=1&k=2')).toBeNull();
  });
});
