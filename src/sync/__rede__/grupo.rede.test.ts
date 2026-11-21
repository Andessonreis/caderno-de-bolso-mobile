import { randomBytes } from 'node:crypto';

import { ALFABETO_GRUPO, TAMANHO_CODIGO, formatarCodigo } from '@/lib/grupo';

import { SyncApi } from '../api';
import { serviceConfig } from '../config';
import { keyFromBytes } from '../links';

const config = serviceConfig();

/** Chamada direta às funções que só o site usa (criar, listar e apagar o grupo). */
async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function codigoAleatorio(): string {
  return Array.from(randomBytes(TAMANHO_CODIGO), (b) => ALFABETO_GRUPO[b % ALFABETO_GRUPO.length]).join('');
}

/**
 * Conversa de verdade com o serviço: cria um grupo de teste como o site faz,
 * entra pelo código, envia, apaga uma visita e, no fim, apaga o grupo.
 */
describe('grupo das visitas (rede real)', () => {
  const api = new SyncApi(config);
  const chave = keyFromBytes(new Uint8Array(randomBytes(32)));
  const codigo = codigoAleatorio();
  let grupo: string | null = null;

  afterAll(async () => {
    if (grupo) await rpc('caderno_grupo_apagar', { p_grupo: grupo, p_chave: chave });
  });

  it('cria, confere, envia, apaga uma visita e apaga o grupo', async () => {
    grupo = (await rpc('caderno_grupo_criar', { p_nome: 'Grupo de teste', p_codigo: codigo, p_chave: chave })) as string;
    console.log(`grupo de teste criado: ${grupo}`);

    // O app digita com traço e minúsculas; o servidor entende igual.
    expect(await api.grupoConferir(formatarCodigo(codigo).toLowerCase())).toBe('Grupo de teste');
    await expect(api.grupoConferir(codigoAleatorio())).rejects.toMatchObject({ kind: 'chave' });

    const agora = new Date().toISOString();
    const visita = { id: 'visita-de-teste-1', dados: { produtor: { nome: 'Maria' } }, atualizado_em: agora, apagado_em: null };
    expect(await api.grupoEnviar(codigo, [visita, { ...visita, id: 'visita-de-teste-2' }])).toBe(2);

    const lista = (await rpc('caderno_grupo_listar', { p_grupo: grupo, p_chave: chave })) as {
      visitas: { id: string; dados: unknown }[];
    };
    expect(lista.visitas.map((v) => v.id).sort()).toEqual(['visita-de-teste-1', 'visita-de-teste-2']);
    console.log('visitas enviadas e lidas pela chave da coordenação');

    const depois = new Date(Date.now() + 1000).toISOString();
    await api.grupoEnviar(codigo, [{ id: 'visita-de-teste-2', dados: {}, atualizado_em: depois, apagado_em: depois }]);
    const semApagada = (await rpc('caderno_grupo_listar', { p_grupo: grupo, p_chave: chave })) as {
      visitas: { id: string }[];
    };
    expect(semApagada.visitas.map((v) => v.id)).toEqual(['visita-de-teste-1']);

    await rpc('caderno_grupo_apagar', { p_grupo: grupo, p_chave: chave });
    grupo = null;
    await expect(api.grupoEnviar(codigo, [visita])).rejects.toMatchObject({ kind: 'chave' });
    console.log('grupo de teste apagado');
  });
});
